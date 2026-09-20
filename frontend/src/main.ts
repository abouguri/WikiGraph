import { state, subscribe } from "./store";
import { renderLegend } from "./panels/legend";
import { renderTimeline } from "./panels/timeline";
import { downloadSaved } from "./panels/saved";
import { rankEntities } from "./search";
import {
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
  buildMap,
  expand,
  findPath,
  setTab,
  persistSaved,
  load,
  retryLast,
  changeSort,
  queueSearch,
  submitSearch,
  back,
  returnToMap,
} from "./controller";
let brushed: string[] = [];
graph.onBrush = (ids) => {
  brushed = ids;
  $("brush-actions").hidden = !ids.length;
  $("brush-count").textContent = `${ids.length} entities selected`;
  message(
    `${ids.length} entities selected. Save the group or use up to three as origins.`,
  );
};
$("save-group").onclick = () => {
  for (const id of brushed) {
    const n = state.nodes.get(id);
    if (n) state.saved.set(id, n);
  }
  persistSaved();
  render();
  syncURL();
  message(`Saved ${brushed.length} entities.`);
};
$("origins-group").onclick = () => {
  if (brushed.length > 3) {
    message("Choose at most three entities as origins.");
    return;
  }
  safe(() => buildMap(brushed));
};
$("clear-group").onclick = () => {
  brushed = [];
  $("brush-actions").hidden = true;
};
for (const format of ["json", "csv", "md"] as const)
  $("export-" + format).onclick = () =>
    downloadSaved([...state.saved.values()], format);
subscribe(() => {
  const nodes = [...state.nodes.values()],
    hasYears = nodes.some((n) => n.year !== null && n.year !== undefined);
  for (const id of ["color-by", "list-sort"]) {
    const option = $(id).querySelector<HTMLOptionElement>(
      'option[value="year"]',
    )!;
    option.hidden = !hasYears;
    option.disabled = !hasYears;
  }
  if (!hasYears && state.colorBy === "year") {
    state.colorBy = "type";
    $<HTMLSelectElement>("color-by").value = "type";
    graph.setEncoding("type", state.sizeBy);
  }
  renderLegend($("type-legend"), () => {
    render();
    syncURL();
  });
  renderTimeline($("timeline"), nodes, state.years, (years) => {
    state.years = years;
    render();
    syncURL();
  });
});
subscribe(() => {
  for (const li of $("entity-list").querySelectorAll<HTMLElement>(
    "[data-node]",
  ))
    li.classList.toggle("selected", li.dataset.node === state.selection);
});
graph.onContext = (id) => {
  select(id);
  $("evidence")
    .querySelector<HTMLButtonElement>(".entity-actions button")
    ?.focus();
};
graph.onExpand = (id) => safe(() => expand(id));
graph.onClear = () => {
  state.selection = "";
  state.active = "";
  render();
  closeInspector();
  syncURL();
};
graph.onHover = (id) => {
  state.hover = id;
  for (const li of $("entity-list").querySelectorAll<HTMLElement>(
    "[data-node]",
  ))
    li.classList.toggle("hovered", li.dataset.node === id);
};
graph.onCamera = () => syncURL();
$("search-form").onsubmit = (e) => {
  e.preventDefault();
  submitSearch();
};
query.oninput = queueSearch;
query.onkeydown = (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    $("results").querySelector<HTMLButtonElement>("button")?.focus();
  }
};
$("results").onkeydown = (e) => {
  const buttons = [...$("results").querySelectorAll("button")],
    i = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    buttons[
      (i + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length
    ]?.focus();
  }
  if (e.key === "Escape") {
    $("results").hidden = true;
    query.focus();
  }
};
mode.onchange = () => safe(() => load());
$("retry").onclick = retryLast;
$("share").onclick = () =>
  safe(async () => {
    syncURL();
    try {
      await navigator.clipboard.writeText(location.href);
      message("Map link copied.");
    } catch {
      message("Copy the map link from your browser address bar.");
    }
  });
$("close-inspector").onclick = closeInspector;
$("inspector-backdrop").onclick = closeInspector;
$("show-inspector").onclick = openInspector;
$("toggle-list").onclick = () => {
  $("left-panel").classList.toggle("collapsed");
  graph.fit();
};
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
  b.onclick = () => setTab(b.dataset.tab!);
  b.onkeydown = (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const all = [
          ...document.querySelectorAll<HTMLButtonElement>("[data-tab]"),
        ],
        i = all.indexOf(b),
        next =
          all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length];
      setTab(next.dataset.tab!);
      next.focus();
    }
  };
}
$("list-sort").onchange = () =>
  changeSort($<HTMLSelectElement>("list-sort").value);
$("color-by").onchange = () => {
  state.colorBy = $<HTMLSelectElement>("color-by").value;
  render();
  syncURL();
};
$("size-by").onchange = () => {
  state.sizeBy = $<HTMLSelectElement>("size-by").value;
  render();
  syncURL();
};
$("map-size").onchange = () => {
  state.mapSize = Math.max(
    5,
    Math.min(80, Number($<HTMLInputElement>("map-size").value) || 40),
  );
  if (state.origins.length) safe(() => buildMap(state.origins, false));
};
for (const id of ["predicate", "direction"] as const)
  $(id).onchange = () => {
    state[id] = $<HTMLSelectElement>(id).value;
    render();
    syncURL();
  };
$("path-toggle").onclick = () => {
  $("path-controls").hidden = !$("path-controls").hidden;
  $("path-toggle").setAttribute(
    "aria-expanded",
    String(!$("path-controls").hidden),
  );
};
$("find-path").onclick = () => safe(findPath);
$("reset").onclick = () => safe(() => buildMap(state.origins, false));
$("back").onclick = back;
$("return-view").onclick = returnToMap;
$<HTMLInputElement>("destination-query").oninput = () => {
  const current = target.value;
  const ranked = rankEntities(
    state.entities.map((n) => ({ ...n, aliases: n.aliases || [] })),
    $<HTMLInputElement>("destination-query").value,
  );
  target.replaceChildren(new Option("Choose an entity", ""));
  for (const n of ranked) target.add(new Option(n.label, n.id));
  target.value = current;
};
let compact = matchMedia("(max-width:899px)").matches;
window.addEventListener("resize", () => {
  const next = matchMedia("(max-width:899px)").matches;
  if (next !== compact) {
    compact = next;
    if (compact) $("left-panel").classList.add("collapsed");
    closeInspector();
  }
});
document.addEventListener("click", (e) => {
  if (!(e.target as Element).closest(".search-wrap"))
    $("results").hidden = true;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("results").hidden = true;
    $("path-controls").hidden = true;
    if ($("inspector").classList.contains("is-open")) closeInspector();
  }
  if (e.key === "/" && !(e.target instanceof HTMLInputElement)) {
    e.preventDefault();
    query.focus();
  }
  if (
    e.key === "f" &&
    !(e.target instanceof HTMLInputElement) &&
    e.target !== $("graph")
  )
    graph.fit();
});
$("inspector").onkeydown = (e) => {
  if (e.key !== "Tab" || !$("inspector").hasAttribute("aria-modal")) return;
  const all = [
      ...$("inspector").querySelectorAll<HTMLElement>(
        'button:not(:disabled),a[href],summary,[tabindex="0"]',
      ),
    ].filter((e) => e.getClientRects().length),
    first = all[0],
    last = all.at(-1);
  if (
    e.shiftKey &&
    (document.activeElement === first ||
      document.activeElement === $("inspector"))
  ) {
    e.preventDefault();
    last?.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first?.focus();
  }
};
mode.value = initial.dataset;
safe(async () => {
  if (!location.hash && !location.search) {
    try {
      const config = await get<{ default_mode: string }>("/config");
      mode.value = config.default_mode === "offline" ? "offline" : "api";
    } catch {
      mode.value = "offline";
    }
  }
  await load(true);
});
