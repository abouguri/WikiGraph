import { GraphView } from "./graph";
import { rankEntities } from "./search";
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
let returnFocus: HTMLElement | SVGElement | null = null;
let retryAction: (() => Promise<void>) | undefined;
const navigation: string[] = [];
let neighborhood:
  | { nodes: Map<string, Entity>; edges: Map<string, Edge>; selected: string }
  | undefined;
let activeAssertion = "",
  pathView = false;
const pages = new Map<string, { offset: number; total: number }>();
const graphView = new GraphView(
  document.getElementById("graph") as unknown as SVGSVGElement,
  selectNode,
  (id) => safeRun(() => inspect(id)),
);
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
  $("retry").hidden = true;
  void action().catch((e) => {
    retryAction = action;
    $("retry").hidden = false;
    message(
      `Unable to load: ${e.message}. Retry, or choose the teaching sample.`,
    );
  });
}
function openInspector(trigger = document.activeElement as HTMLElement) {
  if (!$("inspector").classList.contains("is-open")) returnFocus = trigger;
  $("inspector").classList.add("is-open");
  if (matchMedia("(max-width: 1199px)").matches) {
    document.body.classList.add("inspector-open");
    for (const e of document.querySelectorAll<HTMLElement>(
      ".appbar,.contextbar,.graph-panel,footer",
    ))
      e.inert = true;
    $("inspector-backdrop").hidden = false;
    $("inspector").setAttribute("role", "dialog");
    $("inspector").setAttribute("aria-modal", "true");
    $("inspector").focus({ preventScroll: true });
  }
}
function closeInspector() {
  const wasOpen = $("inspector").classList.contains("is-open");
  document.body.classList.remove("inspector-open");
  for (const e of document.querySelectorAll<HTMLElement>(
    ".appbar,.contextbar,.graph-panel,footer",
  ))
    e.inert = false;
  $("inspector-backdrop").hidden = true;
  $("inspector").classList.remove("is-open");
  $("inspector").removeAttribute("role");
  $("inspector").removeAttribute("aria-modal");
  if (!wasOpen) return;
  if (returnFocus?.isConnected && returnFocus !== document.body)
    returnFocus.focus({ preventScroll: true });
  else if (activeAssertion)
    document
      .querySelector<HTMLElement>(
        `#connections [data-edge="${CSS.escape(activeAssertion)}"] button`,
      )
      ?.focus({ preventScroll: true });
  else $("list-tab").focus({ preventScroll: true });
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
async function neighbors(id: string, offset = 0): Promise<Neighbors> {
  if (mode.value === "api")
    return get(
      `/entities/${encodeURIComponent(id)}/neighbors?${new URLSearchParams({ predicate: predicate.value, direction: direction.value, limit: "12", offset: String(offset) })}`,
    );
  const all = sample.assertions.filter(
    (e) => (e.subject === id || e.object === id) && matching(e, id),
  );
  const slice = all.slice(offset, offset + 12);
  const ids = new Set([id, ...slice.flatMap((e) => [e.subject, e.object])]);
  return {
    nodes: sample.entities.filter((n) => ids.has(n.id)),
    edges: slice,
    total: all.length,
    truncated: offset + 12 < all.length,
  };
}
async function expand(id: string, reset = false) {
  evidenceGeneration++;
  const current = ++generation;
  message("Loading connections…");
  const offset = reset ? 0 : pages.get(id)?.offset || 0;
  const data = await neighbors(id, offset);
  if (current !== generation) return;
  if (reset) {
    nodes.clear();
    edges.clear();
    pages.clear();
  }
  if (!nodes.has(id) && nodes.size >= 40) {
    message(
      "The view already has 40 entities. Collapse to the selection before expanding another entity.",
    );
    return;
  }
  selected = id;
  $("return-view").hidden = true;
  activeAssertion = "";
  pathView = false;
  evidenceGeneration++;
  pages.set(id, { offset: offset + data.edges.length, total: data.total });
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
  render(reset);
  showEntity();
  saveURL();
  message(
    `${data.total} connections around ${nodeLabel(id)}. ${edges.size} visible in this view · ${offset + data.edges.length} fetched of ${data.total}.${nodes.size >= 40 || edges.size >= 120 ? " View limit reached; focus here to explore another neighborhood." : ""}`,
  );
}
function selectNode(id: string) {
  generation++;
  evidenceGeneration++;
  if (selected && selected !== id) navigation.push(selected);
  $<HTMLButtonElement>("back").disabled = !navigation.length;
  selected = id;
  activeAssertion = "";
  render();
  showEntity(true);
  saveURL();
}
function showEntity(open = false) {
  const panel = $("evidence");
  panel.replaceChildren();
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = "Selected entity";
  const title = document.createElement("h2");
  title.textContent = nodeLabel(selected);
  const note = document.createElement("p");
  note.className = "muted";
  const page = pages.get(selected);
  const shown = [...edges.values()].filter(
    (e) => e.subject === selected || e.object === selected,
  ).length;
  note.textContent = `${shown} connections visible for this entity. ${page ? `${page.offset} of ${page.total} matching connections fetched.` : "Expand to load its neighborhood."}`;
  const actions = document.createElement("div");
  actions.className = "entity-actions";
  const more = button(
    page?.offset ? "Show more connections" : "Expand connections",
    () => safeRun(() => expand(selected)),
  );
  more.disabled = (!!page && page.offset >= page.total) || edges.size >= 120;
  const focus = button("Focus here", () =>
    safeRun(() => expand(selected, true)),
  );
  focus.className = "secondary";
  actions.append(more, focus);
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent =
    "Select a line or a connection row to inspect its source. Page references are not extracted facts.";
  panel.append(badge, title, note, actions, hint);
  if (open) openInspector();
}
function render(reset = false) {
  $("selection").textContent = selected
    ? nodeLabel(selected)
    : "Loading your workspace…";
  $("counts").textContent = `${nodes.size} entities · ${edges.size} edges`;
  graphView.update(
    [...nodes.values()],
    [...edges.values()],
    selected,
    activeAssertion,
    reset,
    pathView,
  );
  const list = $("connections");
  list.replaceChildren();
  if (!edges.size) {
    const li = document.createElement("li");
    li.textContent =
      "No connections match this view. Try another relationship or entity.";
    list.append(li);
  }
  const sort = $<HTMLSelectElement>("connection-sort").value;
  const ordered = [...edges.values()].sort((a, b) => {
    if (pathView) return 0;
    const key = (e: Edge) =>
      sort === "relation"
        ? labels[e.predicate]
        : nodeLabel(sort === "destination" ? e.object : e.subject);
    return key(a).localeCompare(key(b)) || a.id.localeCompare(b.id);
  });
  for (const [index, e] of ordered.entries()) {
    const li = document.createElement("li");
    li.dataset.edge = e.id;
    if (e.id === activeAssertion) li.className = "active";
    const text = document.createElement("div");
    text.className = "connection-route";
    const source = document.createElement("strong"),
      relation = document.createElement("span"),
      destination = document.createElement("strong");
    source.textContent = nodeLabel(e.subject);
    relation.textContent = labels[e.predicate] || e.predicate;
    destination.textContent = nodeLabel(e.object);
    relation.className =
      e.predicate === "linksTo" ? "reference-label" : "fact-label";
    text.append(source, relation, destination);
    if (pathView) {
      const step = document.createElement("span");
      step.className = "step-number";
      step.textContent = `Step ${index + 1}`;
      li.append(step);
    }
    li.append(
      text,
      button("Inspect evidence", () => safeRun(() => inspect(e.id))),
      button(`Select ${nodeLabel(e.subject)}`, () => selectNode(e.subject)),
      button(`Select ${nodeLabel(e.object)}`, () => selectNode(e.object)),
    );
    list.append(li);
  }
}
async function inspect(id: string) {
  const trigger = document.activeElement as HTMLElement;
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
  activeAssertion = id;
  render();
  const panel = $("evidence");
  panel.replaceChildren();
  openInspector(trigger);
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent =
    a.source_kind === "synthetic"
      ? "Synthetic teaching example"
      : a.predicate === "linksTo"
        ? "Wikipedia · Page reference"
        : "Wikipedia · Extracted relation";
  if (a.source_kind === "synthetic") badge.classList.add("synthetic");
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
  const explanation = document.createElement("p");
  explanation.className = "muted";
  explanation.textContent =
    a.predicate === "linksTo"
      ? "This page links to another topic. The reference does not establish a factual relationship."
      : "This sentence supports the extracted relationship. Check the source in context.";
  panel.append(badge, heading, explanation, quote);
  const details = document.createElement("details");
  details.className = "evidence-details";
  const summary = document.createElement("summary");
  summary.textContent = "Extraction details";
  details.append(summary, dl);
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
  panel.append(details);
}
async function search() {
  const current = ++searchGeneration;
  const dataset = datasetGeneration;
  const results =
    mode.value === "offline"
      ? rankEntities(sample.entities, query.value).slice(0, 20)
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
    const result = button(n.label, () => {
      if (selected && selected !== n.id) navigation.push(selected);
      $<HTMLButtonElement>("back").disabled = !navigation.length;
      list.hidden = true;
      clearTimeout(searchTimer);
      searchGeneration++;
      safeRun(() => expand(n.id, true));
    });
    result.setAttribute("aria-current", String(n.id === selected));
    li.append(result);
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
    if (!pathView)
      neighborhood = { nodes: new Map(nodes), edges: new Map(edges), selected };
    $("return-view").hidden = false;
    nodes = new Map(data.nodes.map((n) => [n.id, n]));
    edges = new Map(data.edges.map((e) => [e.id, e]));
    pathView = true;
    activeAssertion = "";
    evidenceGeneration++;
    render(true);
    showEntity();
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
  pages.clear();
  navigation.length = 0;
  $<HTMLButtonElement>("back").disabled = true;
  $("return-view").hidden = true;
  $<HTMLInputElement>("destination-query").value = "";
  closeInspector();
  activeAssertion = "";
  pathView = false;
  nodes.clear();
  edges.clear();
  selected = "";
  render(true);
  message("Loading dataset…");
  $("evidence").textContent =
    "Loading the dataset. Source evidence will appear here.";
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
    const apiOption = mode.querySelector<HTMLOptionElement>(
      'option[value="api"]',
    )!;
    apiOption.textContent =
      health.source_kinds.every((kind) => kind === "wikipedia") &&
      health.source_kinds.length
        ? "Wikipedia corpus"
        : health.source_kinds.every((kind) => kind === "synthetic")
          ? "Synthetic server"
          : "Server dataset";
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
  clearTimeout(searchTimer);
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
$("close-inspector").onclick = closeInspector;
$("inspector-backdrop").onclick = closeInspector;
window.addEventListener("resize", () => {
  const compact = matchMedia("(max-width: 1199px)").matches;
  if (!compact && $("inspector").hasAttribute("aria-modal")) closeInspector();
  else if (
    compact &&
    $("inspector").classList.contains("is-open") &&
    !$("inspector").hasAttribute("aria-modal")
  )
    openInspector();
});
document.addEventListener("click", (event) => {
  if (!(event.target as Element).closest(".search-wrap"))
    $("results").hidden = true;
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    $("results").hidden = true;
    if ($("inspector").classList.contains("is-open")) closeInspector();
    $("path-controls").hidden = true;
    $("path-toggle").setAttribute("aria-expanded", "false");
  }
});

$("retry").onclick = () => {
  if (retryAction) safeRun(retryAction);
};
$("back").onclick = () => {
  const id = navigation.pop();
  $<HTMLButtonElement>("back").disabled = !navigation.length;
  if (id) safeRun(() => expand(id, true));
};
$("return-view").onclick = () => {
  if (!neighborhood) return;
  generation++;
  evidenceGeneration++;
  nodes = neighborhood.nodes;
  edges = neighborhood.edges;
  selected = neighborhood.selected;
  pathView = false;
  activeAssertion = "";
  $("return-view").hidden = true;
  render(true);
  showEntity();
  saveURL();
  message("Returned to your neighborhood.");
};
const destinationQuery = $<HTMLInputElement>("destination-query");
destinationQuery.disabled = false;
destinationQuery.oninput = () => {
  const current = target.value;
  const ranked = rankEntities(entities, destinationQuery.value);
  target.replaceChildren(
    new Option(
      ranked.length ? "Choose an entity" : "No matching destinations",
      "",
    ),
  );
  for (const e of ranked) target.add(new Option(e.label, e.id));
  if (ranked.some((e) => e.id === current)) target.value = current;
  saveURL();
};
$<HTMLSelectElement>("connection-sort").disabled = false;
$("connection-sort").onchange = () => render();
let searchTimer: ReturnType<typeof setTimeout>;
query.oninput = () => {
  searchGeneration++;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => safeRun(search), 200);
};
query.onkeydown = (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    $("results").hidden = false;
    $("results").querySelector<HTMLButtonElement>("button")?.focus();
  }
};
$("results").onkeydown = (event) => {
  const buttons = [
    ...$("results").querySelectorAll<HTMLButtonElement>("button"),
  ];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    buttons[
      (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
        buttons.length
    ]?.focus();
  }
  if (event.key === "Escape") query.focus();
};
for (const name of ["graph", "list"]) {
  $(`${name}-tab`).onkeydown = (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const next = name === "graph" ? "list" : "graph";
      setView(next);
      $(`${next}-tab`).focus();
    }
  };
}
$("inspector").onkeydown = (event) => {
  if (event.key !== "Tab" || !matchMedia("(max-width: 1199px)").matches) return;
  const focusable = [
    ...$("inspector").querySelectorAll<HTMLElement>(
      "button:not(:disabled),a[href],summary,[tabindex='0']",
    ),
  ].filter((e) => e.getClientRects().length);
  const first = focusable[0],
    last = focusable[focusable.length - 1];
  if (
    event.shiftKey &&
    (document.activeElement === first ||
      document.activeElement === $("inspector"))
  ) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
};
