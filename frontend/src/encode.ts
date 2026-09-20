export type GraphNode = {
  id: string;
  label: string;
  aliases?: string[];
  type?: string;
  year?: number | null;
  in_links?: number;
  out_links?: number;
  similarity?: number;
  similarity_by_origin?: Record<string, number>;
  cluster?: number;
  is_origin?: boolean;
  summary?: string;
  source_url?: string;
};
export type GraphEdge = {
  id: string;
  subject: string;
  object: string;
  predicate: string;
  kind?: string;
  assertion_id?: string;
};
export type Palette = Record<string, string>;
export function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    [
      "canvas",
      "text",
      "muted",
      "accent",
      "fact",
      "language",
      "person",
      "concept",
      "organization",
      "work",
      "other",
      "year-start",
      "year-end",
    ].map((k) => [k, css.getPropertyValue("--" + k).trim()]),
  );
}
export function nodeRadius(degree: number, max: number, zoom: number) {
  return Math.max(
    2,
    Math.min(
      24,
      (3 + 11 * Math.sqrt(Math.max(0, degree) / Math.max(1, max))) *
        Math.sqrt(zoom),
    ),
  );
}
export function nodeColor(
  n: GraphNode,
  mode: string,
  p: Palette,
  years: [number, number] = [1900, 2030],
) {
  const colors = [
    p.language,
    p.person,
    p.concept,
    p.organization,
    p.work,
    p.other,
  ];
  if (mode === "cluster") return colors[(n.cluster || 0) % colors.length];
  if (mode === "year" && n.year) {
    const t = Math.max(
        0,
        Math.min(1, (n.year - years[0]) / Math.max(1, years[1] - years[0])),
      ),
      a = p["year-start"],
      b = p["year-end"];
    return (
      "#" +
      [1, 3, 5]
        .map((i) =>
          Math.round(
            parseInt(a.slice(i, i + 2), 16) * (1 - t) +
              parseInt(b.slice(i, i + 2), 16) * t,
          )
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    );
  }
  const type = (n.type || "other").toLowerCase();
  return (
    p[type === "work/system" || type === "system" ? "work" : type] || p.other
  );
}
