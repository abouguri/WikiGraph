import { state } from "./store";
export function readURL(input: { hash: string; search: string } = location) {
  const p = new URLSearchParams(input.hash.slice(1)),
    old = new URLSearchParams(input.search);
  const split = (k: string, max = 150) =>
    (p.get(k) || "").split(",").filter(Boolean).slice(0, max);
  const finite = (v: string | null, fallback: number) =>
    v !== null && Number.isFinite(Number(v)) ? Number(v) : fallback;
  const origins = split("o", 3);
  if (!origins.length && old.get("entity")) origins.push(old.get("entity")!);
  const camera = split("v", 3).map(Number);
  let pins: { id: string; x: number; y: number }[] = [];
  try {
    const raw = JSON.parse((p.get("pins") || "[]").slice(0, 20000));
    if (Array.isArray(raw))
      pins = raw
        .filter(
          (n) =>
            n &&
            typeof n.id === "string" &&
            Number.isFinite(n.x) &&
            Number.isFinite(n.y),
        )
        .slice(0, 150);
  } catch {}
  const years = (p.get("y") || "").match(/^(-?\d+)[,-](-?\d+)$/);
  return {
    dataset: (
      p.has("d") ? p.get("d") === "teaching" : old.get("mode") === "offline"
    )
      ? "offline"
      : "api",
    origins,
    selection: (p.get("s") || "").replace(/^node:/, ""),
    mapSize: Math.max(5, Math.min(80, finite(p.get("n"), 40))),
    color: ["type", "cluster", "year"].includes(p.get("c") || "")
      ? p.get("c")!
      : "type",
    size: ["links", "degree", "uniform"].includes(p.get("z") || "")
      ? p.get("z")!
      : "links",
    types: split("t"),
    years: years
      ? ([
          Math.min(Number(years[1]), Number(years[2])),
          Math.max(Number(years[1]), Number(years[2])),
        ] as [number, number])
      : null,
    pins,
    active: p.get("edge") || "",
    added: split("a"),
    removed: split("r"),
    expanded: split("e", 100),
    saved: split("saved"),
    predicate: p.get("p") || old.get("predicate") || "all",
    direction: p.get("dir") || old.get("direction") || "both",
    camera:
      camera.length === 3 && camera.every(Number.isFinite)
        ? { x: camera[0], y: camera[1], scale: camera[2] }
        : undefined,
    pathTarget: p.get("path") || "",
  };
}
export function saveURL() {
  const p = new URLSearchParams({
    d: state.dataset === "offline" ? "teaching" : "wikipedia",
    o: state.origins.join(","),
    n: String(state.mapSize),
    c: state.colorBy,
    z: state.sizeBy,
  });
  if (state.pins.length)
    p.set(
      "pins",
      JSON.stringify(
        state.pins.map((p) => ({
          id: p.id,
          x: Math.round(p.x),
          y: Math.round(p.y),
        })),
      ),
    );
  if (state.active) p.set("edge", state.active);
  if (state.selection) p.set("s", "node:" + state.selection);
  if (state.types.size) p.set("t", [...state.types].sort().join(","));
  if (state.years) p.set("y", state.years.join(","));
  for (const [k, v] of [
    ["a", state.added],
    ["r", state.removed],
    ["e", state.expanded],
    ["saved", [...state.saved.keys()]],
  ] as const)
    if (v.length) p.set(k, v.join(","));
  if (state.predicate !== "all") p.set("p", state.predicate);
  if (state.direction !== "both") p.set("dir", state.direction);
  p.set(
    "v",
    [
      state.camera.x.toFixed(2),
      state.camera.y.toFixed(2),
      state.camera.scale.toFixed(3),
    ].join(","),
  );
  if (state.path)
    p.set(
      "path",
      (document.getElementById("target") as HTMLSelectElement).value,
    );
  history.replaceState(null, "", location.pathname + "#" + p);
}
