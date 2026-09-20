import type { GraphNode, GraphEdge } from "./encode";
import type { LayoutLink } from "./sim";
export type Assertion = GraphEdge & {
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
export type Dataset = { entities: GraphNode[]; assertions: Assertion[] };
export type ListNode = GraphNode & { linked_by: number; in_map: boolean };
export type MapData = {
  origins: string[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout_links: LayoutLink[];
  lists: { foundations: ListNode[]; builds_on_this: ListNode[] };
  stats: { candidates: number; returned: number };
};
export type Explanation = {
  score: number;
  shared: { id: string; label: string; weight: number; directions: string[] }[];
  direct: { page_links: GraphEdge[]; facts: GraphEdge[] };
};
