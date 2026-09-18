type Entity = { id: string; label: string; aliases: string[] };
type Edge = { id: string; subject: string; predicate: string; object: string };
type Assertion = Edge & {
  evidence: string;
  method: string;
  extractor_version: string;
  confidence: string;
  source_kind: string;
  source_url: string;
  revision_id: number;
  start: number | null;
  end: number | null;
};
type Dataset = { entities: Entity[]; assertions: Assertion[] };
type Neighbors = {
  nodes: Entity[];
  edges: Edge[];
  total: number;
  truncated: boolean;
};
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const mode = $<HTMLSelectElement>("mode"),
  predicate = $<HTMLSelectElement>("predicate"),
  direction = $<HTMLSelectElement>("direction");
const target = $<HTMLSelectElement>("target"),
  query = $<HTMLInputElement>("query");
let sample: Dataset,
  selected = "",
  entities: Entity[] = [],
  nodes = new Map<string, Entity>(),
  edges = new Map<string, Edge>(),
  generation = 0,
  datasetGeneration = 0,
  searchGeneration = 0,
  evidenceGeneration = 0;
const labels: Record<string, string> = {
  linksTo: "links to",
  designedBy: "was designed by",
  developedBy: "was developed by",
  influencedBy: "was influenced by",
};
const message = (text: string) => {
  $("status").textContent = text;
};
const nodeLabel = (id: string) =>
  nodes.get(id)?.label || entities.find((n) => n.id === id)?.label || id;
function button(text: string, action: () => void) {
  const b = document.createElement("button");
  b.textContent = text;
  b.type = "button";
  b.onclick = action;
  return b;
}
function safeRun(action: () => Promise<void>) {
  void action().catch((e) =>
    message(
      `Unable to load: ${e.message}. Try again or switch to the offline sample.`,
    ),
  );
}
async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`request failed (${r.status})`);
  return r.json() as Promise<T>;
}
function matching(e: Edge, id: string) {
  return (
    (predicate.value === "all" || e.predicate === predicate.value) &&
    (direction.value === "both" ||
      (direction.value === "out" && e.subject === id) ||
      (direction.value === "in" && e.object === id))
  );
}
function saveURL() {
  const params = new URLSearchParams({
    mode: mode.value,
    entity: selected,
    predicate: predicate.value,
    direction: direction.value,
  });
  if (target.value) params.set("target", target.value);
  history.replaceState(null, "", `?${params}`);
}
async function neighbors(id: string): Promise<Neighbors> {
  if (mode.value === "api")
    return get(
      `/entities/${encodeURIComponent(id)}/neighbors?${new URLSearchParams({ predicate: predicate.value, direction: direction.value, limit: "30" })}`,
    );
  const all = sample.assertions.filter(
    (e) => (e.subject === id || e.object === id) && matching(e, id),
  );
  const slice = all.slice(0, 30);
  const ids = new Set([id, ...slice.flatMap((e) => [e.subject, e.object])]);
  return {
    nodes: sample.entities.filter((n) => ids.has(n.id)),
    edges: slice,
    total: all.length,
    truncated: all.length > 30,
  };
}
async function expand(id: string, reset = false) {
  const current = ++generation;
  message("Loading connections…");
  const data = await neighbors(id);
  if (current !== generation) return;
  if (reset) {
    nodes.clear();
    edges.clear();
  }
  if (!nodes.has(id) && nodes.size >= 40) {
    message(
      "The view already has 40 entities. Collapse to the selection before expanding another entity.",
    );
    return;
  }
  selected = id;
  const center = data.nodes.find((node) => node.id === id);
  if (center) nodes.set(id, center);
  for (const n of data.nodes)
    if (nodes.size < 40 || nodes.has(n.id)) nodes.set(n.id, n);
  for (const e of data.edges)
    if (
      nodes.has(e.subject) &&
      nodes.has(e.object) &&
      (edges.size < 120 || edges.has(e.id))
    )
      edges.set(e.id, e);
  render();
  saveURL();
  message(
    data.truncated || nodes.size >= 40 || edges.size >= 120
      ? "View limited to 40 entities / 120 connections, with 30 per expansion. Narrow the filter to explore more."
      : `${data.total} connections around ${nodeLabel(id)}. Select a connection to inspect evidence.`,
  );
}
function render() {
  $("selection").textContent = nodeLabel(selected);
  $("counts").textContent = `${nodes.size} entities · ${edges.size} edges`;
  const svg = document.getElementById("graph") as unknown as SVGSVGElement;
  svg.replaceChildren();
  const ns = "http://www.w3.org/2000/svg";
  const positions = new Map<string, [number, number]>();
  const others = [...nodes.keys()].filter((id) => id !== selected);
  positions.set(selected, [360, 230]);
  others.forEach((id, i) => {
    const a = (i / Math.max(others.length, 1)) * 2 * Math.PI;
    positions.set(id, [360 + 265 * Math.cos(a), 230 + 175 * Math.sin(a)]);
  });
  for (const edge of edges.values()) {
    const a = positions.get(edge.subject),
      b = positions.get(edge.object);
    if (!a || !b) continue;
    const line = document.createElementNS(ns, "line");
    for (const [k, v] of Object.entries({
      x1: a[0],
      y1: a[1],
      x2: b[0],
      y2: b[1],
    }))
      line.setAttribute(k, String(v));
    line.setAttribute(
      "stroke",
      edge.predicate === "linksTo" ? "#b9c6aa" : "#32644c",
    );
    line.setAttribute(
      "stroke-width",
      edge.predicate === "linksTo" ? "1.5" : "3",
    );
    if (edge.predicate === "linksTo")
      line.setAttribute("stroke-dasharray", "5 4");
    line.style.cursor = "pointer";
    line.onclick = () => safeRun(() => inspect(edge.id));
    svg.append(line);
  }
  for (const [id, [x, y]] of positions) {
    const group = document.createElementNS(ns, "g");
    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("cx", String(x));
    circle.setAttribute("cy", String(y));
    circle.setAttribute("r", id === selected ? "25" : "14");
    circle.setAttribute("fill", id === selected ? "#195749" : "#d9e8bd");
    circle.setAttribute("stroke", "#fffefa");
    circle.setAttribute("stroke-width", "3");
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", `Expand ${nodeLabel(id)}`);
    group.onclick = () => safeRun(() => expand(id));
    group.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        safeRun(() => expand(id));
      }
    };
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", String(x));
    text.setAttribute("y", String(y + (id === selected ? 43 : 30)));
    text.setAttribute("text-anchor", "middle");
    const label = nodeLabel(id);
    text.textContent = label.length > 26 ? label.slice(0, 24) + "…" : label;
    const title = document.createElementNS(ns, "title");
    title.textContent = label;
    group.append(circle, text, title);
    svg.append(group);
  }
  const list = $("connections");
  list.replaceChildren();
  if (!edges.size) {
    const li = document.createElement("li");
    li.textContent =
      "No connections match this view. Try another relationship or entity.";
    list.append(li);
  }
  for (const e of edges.values()) {
    const li = document.createElement("li");
    const text = document.createElement("div");
    text.textContent = `${nodeLabel(e.subject)} → ${labels[e.predicate] || e.predicate} → ${nodeLabel(e.object)}`;
    li.append(
      text,
      button("Inspect evidence", () => safeRun(() => inspect(e.id))),
      button(`Expand ${nodeLabel(e.object)}`, () =>
        safeRun(() => expand(e.object)),
      ),
    );
    list.append(li);
  }
}
async function inspect(id: string) {
  const current = ++evidenceGeneration;
  const dataset = datasetGeneration;
  const atMode = mode.value;
  const a =
    atMode === "offline"
      ? sample.assertions.find((e) => e.id === id)
      : await get<Assertion>(`/assertions/${id}`);
  if (
    !a ||
    atMode !== mode.value ||
    current !== evidenceGeneration ||
    dataset !== datasetGeneration
  )
    return;
  const panel = $("evidence");
  panel.replaceChildren();
  $("inspector").classList.add("is-open");
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent =
    a.source_kind === "synthetic"
      ? "Synthetic teaching example"
      : "Wikipedia revision";
  const heading = document.createElement("h3");
  heading.textContent = `${nodeLabel(a.subject)} ${labels[a.predicate]} ${nodeLabel(a.object)}`;
  const quote = document.createElement("blockquote");
  quote.textContent = a.evidence;
  const dl = document.createElement("dl");
  for (const [k, v] of [
    ["Method", a.method],
    ["Revision", String(a.revision_id)],
    ["Extractor", a.extractor_version],
    ["Confidence", a.confidence],
    ["Text offsets", a.start === null ? "Link target" : `${a.start}–${a.end}`],
  ]) {
    const wrap = document.createElement("div"),
      dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = k;
    dd.textContent = v;
    wrap.append(dt, dd);
    dl.append(wrap);
  }
  panel.append(badge, heading, quote, dl);
  if (a.source_kind === "wikipedia") {
    const u = new URL(a.source_url);
    if (u.protocol === "https:" && u.hostname === "en.wikipedia.org") {
      const link = document.createElement("a");
      link.textContent = "Open source revision ↗";
      link.href = u.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "source-link";
      panel.append(link);
    }
  } else {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent =
      "Authored example, not Wikipedia evidence. Fictional revision ID.";
    panel.append(note);
  }
}
async function search() {
  const current = ++searchGeneration;
  const dataset = datasetGeneration;
  const results =
    mode.value === "offline"
      ? sample.entities
          .filter((n) =>
            [n.label, ...n.aliases].some((s) =>
              s.toLowerCase().includes(query.value.toLowerCase()),
            ),
          )
          .slice(0, 20)
      : (
          await get<{ items: Entity[] }>(
            `/entities?${new URLSearchParams({ q: query.value })}`,
          )
        ).items;
  if (current !== searchGeneration || dataset !== datasetGeneration) return;
  const list = $("results");
  list.replaceChildren();
  list.hidden = false;
  for (const n of results) {
    const li = document.createElement("li");
    li.append(
      button(n.label, () => {
        list.hidden = true;
        safeRun(() => expand(n.id, true));
      }),
    );
    list.append(li);
  }
  if (!results.length) {
    const li = document.createElement("li");
    li.textContent = "No entities found.";
    list.append(li);
  }
}
async function findPath() {
  if (!selected || !target.value) {
    message("Select a starting entity and a destination.");
    return;
  }
  const current = ++generation;
  let data: {
    nodes: Entity[];
    edges: Edge[];
    found: boolean;
    truncated: boolean;
  };
  if (mode.value === "api") {
    data = await get(
      `/paths?${new URLSearchParams({ source: selected, target: target.value, predicate: predicate.value, direction: direction.value })}`,
    );
  } else {
    const queue: { id: string; ids: string[]; edges: Edge[] }[] = [
        { id: selected, ids: [selected], edges: [] },
      ],
      seen = new Set([selected]);
    data = { nodes: [], edges: [], found: false, truncated: false };
    while (queue.length) {
      const path = queue.shift()!;
      if (path.id === target.value) {
        data = {
          nodes: path.ids.map((id) =>
            sample.entities.find((n) => n.id === id)!,
          ),
          edges: path.edges,
          found: true,
          truncated: false,
        };
        break;
      }
      if (path.edges.length >= 4) {
        data.truncated = true;
        continue;
      }
      for (const e of sample.assertions.filter(
        (e) =>
          (e.subject === path.id || e.object === path.id) &&
          matching(e, path.id),
      )) {
        const next = e.subject === path.id ? e.object : e.subject;
        if (!seen.has(next)) {
          seen.add(next);
          queue.push({
            id: next,
            ids: [...path.ids, next],
            edges: [...path.edges, e],
          });
        }
      }
    }
  }
  if (current !== generation) return;
  if (data.found) {
    nodes = new Map(data.nodes.map((n) => [n.id, n]));
    edges = new Map(data.edges.map((e) => [e.id, e]));
    render();
    message(
      `Shortest path: ${data.edges.length} connections. Direction: ${direction.value}.`,
    );
  } else
    message(
      data.truncated
        ? "No path found within the search bounds."
        : "No path exists with these filters.",
    );
  saveURL();
}
async function load() {
  const current = ++datasetGeneration;
  generation++;
  searchGeneration++;
  evidenceGeneration++;
  message("Loading dataset…");
  $("evidence").textContent = "Select a connection to inspect its evidence.";
  const params = new URLSearchParams(location.search);
  let loaded: Entity[] = [];
  let note = "";
  if (mode.value === "offline") {
    const data = sample || (await get<Dataset>("/sample.json"));
    if (current !== datasetGeneration) return;
    sample = data;
    loaded = sample.entities;
    note = "Authored sample · synthetic revisions · works offline";
  } else {
    let total = 0;
    do {
      const batch = await get<{ items: Entity[]; total: number }>(
        `/entities?limit=100&offset=${loaded.length}`,
      );
      if (current !== datasetGeneration) return;
      loaded.push(...batch.items);
      total = batch.total;
      if (!batch.items.length) break;
    } while (loaded.length < total && loaded.length < 1000);
    const health = await get<{ source_kinds: string[] }>("/health");
    if (current !== datasetGeneration) return;
    note = `Server dataset · ${health.source_kinds.join(", ")} · ${loaded.length} entities`;
    if (total > loaded.length) note += " (destination list limited to 1,000)";
  }
  entities = loaded;
  $("dataset-note").textContent = note;
  target.replaceChildren(new Option("Choose an entity", ""));
  for (const e of entities) target.add(new Option(e.label, e.id));
  target.value = params.get("target") || "";
  const desired = params.get("entity");
  const start =
    entities.find((e) => e.id === desired) ||
    entities.find((e) => e.label === "Python (programming language)") ||
    entities[0];
  await search();
  $("results").hidden = true;
  if (current !== datasetGeneration) return;
  if (start) await expand(start.id, true);
  else {
    nodes.clear();
    edges.clear();
    render();
    message("This dataset has no entities.");
  }
}
$("search-form").onsubmit = (e) => {
  e.preventDefault();
  safeRun(search);
};
mode.onchange = () => safeRun(load);
predicate.onchange = direction.onchange = () =>
  safeRun(() => expand(selected, true));
$("reset").onclick = () => safeRun(() => expand(selected, true));
$("find-path").onclick = () => safeRun(findPath);
target.onchange = saveURL;
$("share").onclick = () =>
  safeRun(async () => {
    saveURL();
    try {
      await navigator.clipboard.writeText(location.href);
      message("View link copied.");
    } catch {
      message(`Copy the address from your browser: ${location.href}`);
    }
  });
const params = new URLSearchParams(location.search);
for (const control of [mode, predicate, direction]) {
  const value = params.get(control.id);
  if (value && [...control.options].some((o) => o.value === value))
    control.value = value;
}
safeRun(async () => {
  if (!params.has("mode")) {
    try {
      const config = await get<{ default_mode: string }>("/config");
      mode.value = config.default_mode === "api" ? "api" : "offline";
    } catch {
      mode.value = "offline";
    }
  }
  await load();
});

function setView(view: "graph" | "list") {
  for (const name of ["graph", "list"]) {
    $(`${name}-tab`).setAttribute("aria-selected", String(view === name));
    $(`${name}-view`).hidden = view !== name;
  }
}
$("graph-tab").onclick = () => setView("graph");
$("list-tab").onclick = () => setView("list");
if (matchMedia("(max-width: 767px)").matches) setView("list");
$("path-toggle").onclick = () => {
  const panel = $("path-controls");
  panel.hidden = !panel.hidden;
  $("path-toggle").setAttribute("aria-expanded", String(!panel.hidden));
};
$("close-inspector").onclick = () => $("inspector").classList.remove("is-open");
document.addEventListener("click", (event) => {
  if (!(event.target as Element).closest(".search-wrap"))
    $("results").hidden = true;
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    $("results").hidden = true;
    $("inspector").classList.remove("is-open");
  }
});
