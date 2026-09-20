import type { GraphNode } from "../encode";
export function exportSaved(nodes: GraphNode[], format: "json" | "csv" | "md") {
  const safe = (n: GraphNode) => {
    let url = "";
    try {
      const u = new URL(n.source_url || "");
      if (u.protocol === "https:" && u.hostname === "en.wikipedia.org")
        url = u.href;
    } catch {}
    return {
      id: n.id,
      label: n.label,
      url,
      type: n.type || "Other",
      year: n.year ?? null,
    };
  };
  const rows = nodes.map(safe);
  const csv = (s: unknown) => '"' + String(s ?? "").replace(/"/g, '""') + '"';
  const markdown = (s: string) => s.replace(/[\\`*_{}[\]()#+.!<>]/g, "\\$&");
  const content =
    format === "json"
      ? JSON.stringify(rows, null, 2)
      : format === "csv"
        ? [
            "id,label,url,type,year",
            ...rows.map((n) =>
              [n.id, n.label, n.url, n.type, n.year].map(csv).join(","),
            ),
          ].join("\r\n")
        : "# Saved WikiGraph entities\n\n" +
          rows
            .map(
              (n) =>
                `- ${n.url ? `[${markdown(n.label)}](${n.url})` : markdown(n.label) + (n.id.startsWith("fixture-") ? " (synthetic teaching entity)" : " (source unavailable)")} — ${n.id}`,
            )
            .join("\n");
  return {
    content,
    type:
      format === "json"
        ? "application/json"
        : format === "csv"
          ? "text/csv"
          : "text/markdown",
    filename: "wikigraph-saved." + format,
  };
}
export function downloadSaved(
  nodes: GraphNode[],
  format: "json" | "csv" | "md",
) {
  const file = exportSaved(nodes, format),
    url = URL.createObjectURL(
      new Blob([file.content], { type: file.type + ";charset=utf-8" }),
    );
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
