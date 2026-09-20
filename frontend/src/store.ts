import type { GraphNode, GraphEdge } from "./encode";
import type { MapData } from "./model";
import type { LayoutLink } from "./sim";
export const state = {
  dataset: "api",
  entities: [] as GraphNode[],
  nodes: new Map<string, GraphNode>(),
  edges: new Map<string, GraphEdge>(),
  origins: [] as string[],
  layoutLinks: [] as LayoutLink[],
  selection: "",
  active: "",
  hover: "",
  mapSize: 40,
  colorBy: "type",
  sizeBy: "links",
  predicate: "all",
  direction: "both",
  types: new Set<string>(),
  years: null as [number, number] | null,
  saved: new Map<string, GraphNode>(),
  lists: { foundations: [], builds_on_this: [] } as MapData["lists"],
  camera: { x: 0, y: 0, scale: 1 },
  pins: [] as { id: string; x: number; y: number }[],
  path: false,
  added: [] as string[],
  removed: [] as string[],
  expanded: [] as string[],
};
const subscribers = new Set<() => void>();
export function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
export function notify() {
  for (const fn of subscribers) fn();
}
export function applyMap(map: MapData) {
  state.nodes = new Map(map.nodes.map((n) => [n.id, n]));
  state.edges = new Map(map.edges.map((e) => [e.id, e]));
  state.origins = map.origins;
  state.layoutLinks = map.layout_links;
  state.lists = map.lists;
  state.path = false;
  state.active = "";
  state.added = [];
  state.removed = [];
  state.expanded = [];
}
