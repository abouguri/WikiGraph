import { GraphView } from "./renderer";
import { LIMITS } from "./config";
import { state, applyMap, notify } from "./store";
import { readURL, saveURL } from "./url";
import { OfflineIndex } from "./offline";
import { rankEntities } from "./search";
import {
  button,
  element,
  renderEntity,
  renderEvidence,
  renderExplanation,
} from "./panels/detail";
import { renderList } from "./panels/list";
import type { GraphNode, GraphEdge } from "./encode";
import type { Dataset, MapData, Assertion, Explanation } from "./model";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const mode = $<HTMLSelectElement>("mode"),
  query = $<HTMLInputElement>("query"),
  target = $<HTMLSelectElement>("target");
let datasetGeneration = 0,
  operation = 0,
  evidenceGeneration = 0,
  searchGeneration = 0;
let offline: OfflineIndex | undefined,
  tab = "map",
  sort = "similarity",
  retry: (() => Promise<void>) | undefined;
let returnFocus: HTMLElement | null = null,
  restoring = false;
let neighborhood:
  | {
      nodes: Map<string, GraphNode>;
      edges: Map<string, GraphEdge>;
      selection: string;
    }
  | undefined;
const offsets = new Map<string, number>(),
  navigation: string[][] = [];
const initial = readURL();
new ResizeObserver(() =>
  document.documentElement.style.setProperty(
    "--list-top",
    `${$("context").getBoundingClientRect().bottom + 12}px`,
  ),
).observe($("context"));
const graph = new GraphView($<HTMLCanvasElement>("graph"), select, (id) =>
  safe(() => inspect(id)),
);
const label = (id: string) =>
  state.nodes.get(id)?.label ||
  state.entities.find((n) => n.id === id)?.label ||
  id;
const message = (text: string) => {
  $("status").textContent = text;
};
async function get<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}
function safe(action: () => Promise<void>) {
  $("retry").hidden = true;
  void action().catch((error) => {
    retry = action;
    $("retry").hidden = false;
    message(`Couldn't build the map. Try again. ${error.message}`);
  });
}
function syncURL() {
  if (!restoring) {
    state.camera = { ...graph.camera };
    state.pins = graph.getPins();
    saveURL();
  }
}
function openInspector() {
  const panel = $("inspector");
  const opening = panel.classList.contains("collapsed");
  if (!panel.classList.contains("is-open"))
    returnFocus = document.activeElement as HTMLElement;
  panel.classList.remove("collapsed");
  panel.classList.add("is-open");
  $("show-inspector").hidden = true;
  if (matchMedia("(max-width: 899px)").matches) {
    for (const id of ["app-header", "context", "left-panel", "graph-panel"])
      $(id).inert = true;
    $("inspector-backdrop").hidden = false;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.focus({ preventScroll: true });
  } else if (opening) graph.fit();
}
function closeInspector() {
  const panel = $("inspector");
  panel.classList.remove("is-open");
  panel.classList.add("collapsed");
  for (const id of ["app-header", "context", "left-panel", "graph-panel"])
    $(id).inert = false;
  $("inspector-backdrop").hidden = true;
  panel.removeAttribute("role");
  panel.removeAttribute("aria-modal");
  $("show-inspector").hidden = false;
  if (
    returnFocus?.isConnected &&
    returnFocus !== document.body &&
    !$("inspector").contains(returnFocus)
  )
    returnFocus.focus({ preventScroll: true });
  else if (state.active)
    $("entity-list")
      .querySelector<HTMLButtonElement>(
        `[data-edge="${CSS.escape(state.active)}"] button`,
      )
      ?.focus({ preventScroll: true });
  else if (state.selection)
    $("entity-list")
      .querySelector<HTMLButtonElement>(
        `[data-node="${CSS.escape(state.selection)}"] button`,
      )
      ?.focus({ preventScroll: true });
  graph.fit();
}
function hiddenNodes() {
  const hidden = new Set<string>();
  const eligible = new Set([
    ...state.origins,
    ...visibleEdges().flatMap((e) => [e.subject, e.object]),
  ]);
  for (const n of state.nodes.values()) {
    if (
      ((state.predicate !== "all" || state.direction !== "both") &&
        !eligible.has(n.id)) ||
      state.types.has((n.type || "Other").toLowerCase()) ||
      (state.years &&
        (n.year === null ||
          n.year === undefined ||
          n.year < state.years[0] ||
          n.year > state.years[1]))
    )
      hidden.add(n.id);
  }
  return hidden;
}
function visibleEdges() {
  return [...state.edges.values()].filter(
    (e) =>
      (state.predicate === "all" || e.predicate === state.predicate) &&
      (state.direction === "both" ||
        state.origins.some((id) =>
          state.direction === "out" ? e.subject === id : e.object === id,
        )),
  );
}
function render(reset = false) {
  const hidden = hiddenNodes();
  $("selection").textContent = state.origins.length
    ? state.origins.map(label).join(" + ")
    : "Explore connections";
  $("counts").textContent =
    `${hidden.size ? `${state.nodes.size - hidden.size} / ` : ""}${state.nodes.size} entities · ${visibleEdges().filter((e) => !hidden.has(e.subject) && !hidden.has(e.object)).length} connections`;
  $("landing").hidden = state.origins.length > 0;
  $("origins").replaceChildren();
  for (const id of state.origins) {
    const chip = button(
      state.origins.length === 1 ? "Remove origin ×" : `${label(id)} ×`,
      () => safe(() => buildMap(state.origins.filter((o) => o !== id))),
      "origin-chip",
    );
    chip.setAttribute("aria-label", `Remove origin ${label(id)}`);
    $("origins").append(chip);
  }
  graph.setLayoutLinks(state.layoutLinks);
  graph.setEncoding(state.colorBy, state.sizeBy);
  graph.setHidden(hidden);
  graph.setFilteredEdges(
    new Set(
      [...state.edges.keys()].filter(
        (id) => !visibleEdges().some((e) => e.id === id),
      ),
    ),
  );
  graph.update(
    [...state.nodes.values()],
    [...state.edges.values()],
    state.selection,
    state.active,
    reset,
    state.path,
  );
  renderList(
    $("entity-list"),
    tab,
    sort,
    {
      select,
      add: (id) => safe(() => addNode(id)),
      hover: (id) => {
        state.hover = id;
        graph.setHover(id);
      },
      inspect: (id) => safe(() => inspect(id)),
    },
    hidden,
  );
  $("back").toggleAttribute("disabled", !navigation.length);
  $("return-view").hidden = !state.path;
  notify();
}
function select(id: string) {
  if (!state.nodes.has(id)) return;
  evidenceGeneration++;
  state.selection = id;
  state.active = "";
  render();
  showEntity();
  openInspector();
  syncURL();
  message(`Selected ${label(id)}.`);
  if (state.dataset === "api" && state.nodes.get(id)?.in_links === undefined) {
    const dataset = datasetGeneration;
    void get<MapData>(
      "/graph/map?" + new URLSearchParams({ origins: id, limit: "5" }),
    )
      .then((data) => {
        if (dataset !== datasetGeneration || !state.nodes.has(id)) return;
        const node = data.nodes.find((n) => n.id === id);
        if (node) {
          state.nodes.set(id, {
            ...state.nodes.get(id)!,
            summary: node.summary,
            source_url: node.source_url,
            type: node.type,
            year: node.year,
            in_links: node.in_links,
            out_links: node.out_links,
          });
          if (state.selection === id && !state.active) {
            render();
            showEntity();
          }
        }
      })
      .catch(() => {
        /* Metadata can be retried by reselecting; evidence stays independently available. */
      });
  }
}
function showEntity() {
  const n = state.nodes.get(state.selection);
  if (!n) return;
  renderEntity(
    $("evidence"),
    n,
    [...state.edges.values()],
    label,
    {
      origin: () => safe(() => buildMap([n.id])),
      addOrigin: () => safe(() => buildMap([...state.origins, n.id])),
      expand: () => safe(() => expand(n.id)),
      save: () => {
        state.saved.has(n.id)
          ? state.saved.delete(n.id)
          : state.saved.set(n.id, n);
        render();
        showEntity();
        persistSaved();
        syncURL();
      },
      remove: () => removeNode(n.id),
      path: () => {
        target.value = n.id;
        $("path-controls").hidden = false;
        safe(findPath);
      },
      why: () => safe(() => why(n.id)),
      inspect: (id) => safe(() => inspect(id)),
    },
    state.origins.length,
    state.saved.has(n.id),
  );
}
function trimEdges() {
  state.edges = new Map(
    [...state.edges.values()]
      .sort(
        (a, b) =>
          Number(a.predicate === "linksTo") -
            Number(b.predicate === "linksTo") || a.id.localeCompare(b.id),
      )
      .slice(0, LIMITS.edges)
      .map((e) => [e.id, e]),
  );
}
async function mapData(origins: string[]) {
  return state.dataset === "offline"
    ? offline!.map(origins, state.mapSize)
    : get<MapData>(
        "/graph/map?" +
          new URLSearchParams({
            origins: origins.join(","),
            limit: String(state.mapSize),
          }),
      );
}
async function buildMap(origins: string[], remember = true) {
  const ids = [...new Set(origins)].slice(0, 3);
  if (remember && state.origins.length) navigation.push([...state.origins]);
  const current = ++operation;
  evidenceGeneration++;
  if (!ids.length) {
    state.nodes.clear();
    state.edges.clear();
    state.origins = [];
    state.selection = "";
    state.active = "";
    state.layoutLinks = [];
    state.lists = { foundations: [], builds_on_this: [] };
    state.added = [];
    state.removed = [];
    state.expanded = [];
    render(true);
    syncURL();
    message("");
    return;
  }
  message("Building the map…");
  $("graph-panel").setAttribute("aria-busy", "true");
  try {
    const data = await mapData(ids);
    if (current !== operation) return;
    applyMap(data);
    trimEdges();
    offsets.clear();
    state.selection = ids[0];
    render(true);
    showEntity();
    syncURL();
    message(
      data.nodes.length <= ids.length
        ? "No similar entities found. Try another origin or expand its connections."
        : `Map ready${data.edges.length > LIMITS.edges ? " · Showing 500 connections; facts first." : ""}`,
    );
  } finally {
    if (current === operation) $("graph-panel").removeAttribute("aria-busy");
  }
}
async function neighbors(
  id: string,
  offset = 0,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; total: number }> {
  if (state.dataset === "api")
    return get(
      `/entities/${encodeURIComponent(id)}/neighbors?limit=${LIMITS.expansion}&offset=${offset}`,
    );
  const all = offline!.data.assertions.filter(
      (e) => e.subject === id || e.object === id,
    ),
    edges = all.slice(offset, offset + LIMITS.expansion),
    ids = new Set([id, ...edges.flatMap((e) => [e.subject, e.object])]);
  return {
    nodes: offline!.data.entities.filter((n) => ids.has(n.id)),
    edges,
    total: all.length,
  };
}
async function expand(id: string, record = true) {
  if (state.nodes.size >= LIMITS.nodes) {
    message(
      "Map limit reached (150 entities). Remove entities or start a new map.",
    );
    return;
  }
  const current = ++operation;
  const data = await neighbors(id, offsets.get(id) || 0);
  if (current !== operation) return;
  for (const n of data.nodes)
    if (state.nodes.has(n.id) || state.nodes.size < LIMITS.nodes)
      state.nodes.set(n.id, { ...n, ...state.nodes.get(n.id) });
  for (const e of data.edges)
    if (state.nodes.has(e.subject) && state.nodes.has(e.object))
      state.edges.set(e.id, e);
  state.removed = state.removed.filter((removed) => !state.nodes.has(removed));
  trimEdges();
  offsets.set(id, (offsets.get(id) || 0) + data.edges.length);
  if (record) state.expanded.push(id);
  state.path = false;
  render();
  showEntity();
  syncURL();
  message(
    `Expanded ${label(id)} · ${offsets.get(id)} of ${data.total} connections fetched.${state.nodes.size >= LIMITS.nodes ? " Map limit reached (150 entities). Remove entities or start a new map." : ""}`,
  );
}
async function addNode(id: string, record = true) {
  if (state.nodes.has(id)) {
    select(id);
    return;
  }
  if (state.nodes.size >= LIMITS.nodes) {
    message(
      "Map limit reached (150 entities). Remove entities or start a new map.",
    );
    return;
  }
  const current = ++operation;
  const n =
    state.entities.find((n) => n.id === id) ||
    state.lists.foundations.find((n) => n.id === id) ||
    state.lists.builds_on_this.find((n) => n.id === id);
  if (!n) return;
  const data = await neighbors(id);
  if (current !== operation) return;
  state.nodes.set(id, n);
  for (const e of data.edges)
    if (state.nodes.has(e.subject) && state.nodes.has(e.object))
      state.edges.set(e.id, e);
  trimEdges();
  state.removed = state.removed.filter((removed) => removed !== id);
  if (record) state.added.push(id);
  state.selection = id;
  render();
  showEntity();
  syncURL();
}
function removeNode(id: string, record = true) {
  state.nodes.delete(id);
  for (const [key, e] of state.edges)
    if (e.subject === id || e.object === id) state.edges.delete(key);
  if (record) state.removed.push(id);
  if (state.selection === id) state.selection = state.origins[0] || "";
  render();
  showEntity();
  syncURL();
}
async function why(id: string) {
  const current = ++evidenceGeneration;
  const panel = $("why");
  panel.replaceChildren(element("p", "Loading shared connections…", "hint"));
  for (const origin of state.origins) {
    const data =
      state.dataset === "offline"
        ? offline!.explain(id, origin)
        : await get<Explanation>(
            "/similarity/explain?" + new URLSearchParams({ a: id, b: origin }),
          );
    if (current !== evidenceGeneration || state.selection !== id) return;
    const section = element("section");
    section.append(element("h3", `Compared with ${label(origin)}`));
    const content = element("div");
    renderExplanation(content, data, (e) => safe(() => inspect(e)));
    section.append(content);
    if (origin === state.origins[0]) panel.replaceChildren();
    panel.append(section);
  }
}
async function inspect(id: string) {
  const current = ++evidenceGeneration,
    dataset = datasetGeneration;
  const a =
    state.dataset === "offline"
      ? offline!.data.assertions.find((e) => e.id === id)
      : await get<Assertion>("/assertions/" + id);
  if (!a || current !== evidenceGeneration || dataset !== datasetGeneration)
    return;
  state.active = id;
  render();
  renderEvidence($("evidence"), a, label);
  openInspector();
  syncURL();
  message(
    `Inspecting ${a.predicate === "linksTo" ? "page reference" : "extracted fact"} evidence.`,
  );
}
async function search() {
  const current = ++searchGeneration,
    dataset = datasetGeneration;
  const found =
    state.dataset === "offline"
      ? rankEntities(
          state.entities.map((n) => ({ ...n, aliases: n.aliases || [] })),
          query.value,
        ).slice(0, 20)
      : (
          await get<{ items: GraphNode[] }>(
            "/entities?" + new URLSearchParams({ q: query.value }),
          )
        ).items;
  if (current !== searchGeneration || dataset !== datasetGeneration) return;
  const results = $("results");
  results.replaceChildren();
  results.hidden = false;
  for (const n of found) {
    const li = element("li");
    li.append(
      button(n.label, () => {
        results.hidden = true;
        clearTimeout(timer);
        searchGeneration++;
        safe(() => buildMap([n.id]));
      }),
    );
    results.append(li);
  }
  if (!found.length) results.append(element("li", "No entities found."));
}
async function findPath() {
  const source = state.origins[0],
    destination = target.value;
  if (!source || !destination) {
    message("Choose an origin and a destination.");
    return;
  }
  const current = ++operation;
  let data: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    found: boolean;
    truncated: boolean;
  };
  if (state.dataset === "api")
    data = await get(
      "/paths?" +
        new URLSearchParams({
          source,
          target: destination,
          predicate: state.predicate,
          direction: state.direction,
        }),
    );
  else {
    const queue = [{ id: source, ids: [source], edges: [] as GraphEdge[] }],
      seen = new Set([source]);
    data = { nodes: [], edges: [], found: false, truncated: false };
    while (queue.length) {
      const p = queue.shift()!;
      if (p.id === destination) {
        data = {
          nodes: p.ids.map((id) => offline!.node(id)),
          edges: p.edges,
          found: true,
          truncated: false,
        };
        break;
      }
      if (p.edges.length >= 4) {
        data.truncated = true;
        continue;
      }
      for (const e of offline!.data.assertions) {
        if (state.predicate !== "all" && state.predicate !== e.predicate)
          continue;
        if (
          (state.direction === "out" && e.subject !== p.id) ||
          (state.direction === "in" && e.object !== p.id)
        )
          continue;
        if (e.subject !== p.id && e.object !== p.id) continue;
        const id = e.subject === p.id ? e.object : e.subject;
        if (!seen.has(id)) {
          seen.add(id);
          queue.push({ id, ids: [...p.ids, id], edges: [...p.edges, e] });
        }
      }
    }
  }
  if (current !== operation) return;
  if (!data.found) {
    message(
      data.truncated
        ? "No path found within four hops."
        : "No path exists with these filters.",
    );
    return;
  }
  if (!state.path)
    neighborhood = {
      nodes: new Map(state.nodes),
      edges: new Map(state.edges),
      selection: state.selection,
    };
  state.nodes = new Map(data.nodes.map((n) => [n.id, n]));
  state.edges = new Map(data.edges.map((e) => [e.id, e]));
  state.path = true;
  state.active = "";
  state.selection = source;
  render(true);
  setTab("connections");
  showEntity();
  syncURL();
  message(`Shortest path: ${data.edges.length} connections.`);
}
function setTab(value: string) {
  tab = value;
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
    b.setAttribute("aria-selected", String(b.dataset.tab === tab));
    b.tabIndex = b.dataset.tab === tab ? 0 : -1;
  }
  renderList(
    $("entity-list"),
    tab,
    sort,
    {
      select,
      add: (id) => safe(() => addNode(id)),
      hover: (id) => graph.setHover(id),
      inspect: (id) => safe(() => inspect(id)),
    },
    hiddenNodes(),
  );
  $("left-panel").classList.remove("collapsed");
  $("saved-export").hidden = value !== "saved";
  graph.fit();
}
function persistSaved() {
  try {
    localStorage.setItem(
      "wikigraph-saved-" + state.dataset,
      JSON.stringify([...state.saved.values()]),
    );
  } catch {
    message("Saved for this session; browser storage is unavailable.");
  }
}
async function load(restore = false) {
  restoring = false;
  $("suggestions").replaceChildren();
  $("results").hidden = true;
  clearTimeout(timer);
  offsets.clear();
  state.added = [];
  state.removed = [];
  state.expanded = [];
  state.pins = [];
  state.layoutLinks = [];
  state.lists = { foundations: [], builds_on_this: [] };
  const current = ++datasetGeneration;
  operation++;
  evidenceGeneration++;
  searchGeneration++;
  state.dataset = mode.value;
  if (matchMedia("(max-width:899px)").matches)
    $("left-panel").classList.add("collapsed");
  state.nodes.clear();
  state.edges.clear();
  state.origins = [];
  state.selection = "";
  state.active = "";
  state.path = false;
  state.saved.clear();
  state.types.clear();
  state.years = null;
  navigation.length = 0;
  neighborhood = undefined;
  closeInspector();
  render(true);
  message("Loading dataset…");
  let suggested: GraphNode[] = [];
  if (state.dataset === "offline") {
    if (!offline)
      offline = new OfflineIndex(await get<Dataset>("/sample.json"));
    if (current !== datasetGeneration) return;
    state.entities = offline.data.entities;
    suggested = offline.top();
    $("dataset-note").textContent =
      "Teaching sample · authored, synthetic evidence";
  } else {
    let entities: GraphNode[] = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const batch = await get<{ items: GraphNode[]; total: number }>(
        `/entities?limit=100&offset=${offset}`,
      );
      if (current !== datasetGeneration) return;
      entities.push(...batch.items);
      if (entities.length >= batch.total || !batch.items.length) break;
    }
    const top = await get<{ items: GraphNode[] }>("/entities/top");
    if (current !== datasetGeneration) return;
    state.entities = entities;
    suggested = top.items;
    const health = await get<{ source_kinds: string[] }>("/health");
    if (current !== datasetGeneration) return;
    const real =
      health.source_kinds.length &&
      health.source_kinds.every((k) => k === "wikipedia");
    mode.options[0].textContent = real
      ? "Wikipedia corpus"
      : "Synthetic server";
    $("dataset-note").textContent =
      `${real ? "Wikipedia corpus" : "Server dataset"} · ${entities.length} entities`;
  }
  if (current !== datasetGeneration) return;
  target.replaceChildren(new Option("Choose an entity", ""));
  for (const n of state.entities) target.add(new Option(n.label, n.id));
  $("suggestions").replaceChildren();
  for (const n of suggested)
    $("suggestions").append(
      button(n.label, () => safe(() => buildMap([n.id])), "suggestion"),
    );
  const valid = new Set(state.entities.map((n) => n.id));
  let saved: string[] = [];
  try {
    const stored = JSON.parse(
      localStorage.getItem("wikigraph-saved-" + state.dataset) || "[]",
    );
    if (Array.isArray(stored)) {
      for (const entry of stored) {
        const id = typeof entry === "string" ? entry : entry?.id;
        if (typeof id === "string" && valid.has(id)) {
          saved.push(id);
          if (typeof entry === "object")
            state.saved.set(id, {
              ...state.entities.find((n) => n.id === id)!,
              source_url:
                typeof entry.source_url === "string" ? entry.source_url : "",
              summary: typeof entry.summary === "string" ? entry.summary : "",
            });
        }
      }
    }
  } catch {
    /* session-only storage */
  }
  for (const id of restore && initial.saved.length ? initial.saved : saved) {
    const n = state.entities.find((n) => n.id === id);
    if (n && !state.saved.has(id)) state.saved.set(id, n);
  }
  if (restore) {
    restoring = true;
    try {
      state.mapSize = initial.mapSize;
      state.colorBy = initial.color;
      state.sizeBy = initial.size;
      state.types = new Set(initial.types);
      state.years = initial.years;
      state.predicate = [
        "all",
        "linksTo",
        "designedBy",
        "developedBy",
        "influencedBy",
      ].includes(initial.predicate)
        ? initial.predicate
        : "all";
      state.direction = ["both", "out", "in"].includes(initial.direction)
        ? initial.direction
        : "both";
      $<HTMLSelectElement>("predicate").value = state.predicate;
      $<HTMLSelectElement>("direction").value = state.direction;
      $<HTMLSelectElement>("color-by").value = state.colorBy;
      $<HTMLSelectElement>("size-by").value = state.sizeBy;
      $<HTMLInputElement>("map-size").value = String(state.mapSize);
      const origins = initial.origins.filter((id) => valid.has(id));
      await buildMap(origins, false);
      if (current !== datasetGeneration) return;
      for (const id of initial.added) {
        if (valid.has(id)) await addNode(id);
        if (current !== datasetGeneration) return;
      }
      for (const id of initial.expanded) {
        if (valid.has(id)) await expand(id);
        if (current !== datasetGeneration) return;
      }
      for (const id of initial.removed) removeNode(id);
      if (state.nodes.has(initial.selection)) {
        state.selection = initial.selection;
        showEntity();
      }
      if (initial.pathTarget && valid.has(initial.pathTarget)) {
        target.value = initial.pathTarget;
        await findPath();
      }
      for (const id of state.saved.keys()) {
        const n = state.nodes.get(id);
        if (n) state.saved.set(id, n);
      }
      render();
      graph.setPins(initial.pins);
      if (initial.camera) graph.setCamera(initial.camera);
      if (initial.active && state.edges.has(initial.active))
        await inspect(initial.active);
      if (current !== datasetGeneration) return;
      if (initial.origins.some((id) => !valid.has(id)))
        message(
          "Some shared entities are unavailable. Loaded the remaining origins.",
        );
    } finally {
      if (current === datasetGeneration) restoring = false;
    }
  } else {
    render(true);
    message("");
  }
  syncURL();
}

export function retryLast() {
  if (retry) safe(retry);
}
export function changeSort(value: string) {
  sort = value;
  render();
}
export function queueSearch() {
  searchGeneration++;
  clearTimeout(timer);
  timer = setTimeout(() => safe(search), 200);
}
export function submitSearch() {
  clearTimeout(timer);
  safe(search);
}
export function back() {
  const origins = navigation.pop();
  if (origins) safe(() => buildMap(origins, false));
}
export function returnToMap() {
  if (!neighborhood) return;
  state.nodes = neighborhood.nodes;
  state.edges = neighborhood.edges;
  state.selection = neighborhood.selection;
  state.path = false;
  render(true);
  showEntity();
  syncURL();
  message("Returned to your map.");
}
let timer: ReturnType<typeof setTimeout>;
export {
  $,
  graph,
  mode,
  query,
  target,
  initial,
  message,
  get,
  safe,
  syncURL,
  openInspector,
  closeInspector,
  render,
  select,
  showEntity,
  buildMap,
  expand,
  inspect,
  search,
  findPath,
  setTab,
  persistSaved,
  load,
};
