import { layout, type Point } from "./layout";
export type GraphNode = { id: string; label: string };
export type GraphEdge = {
  id: string;
  subject: string;
  object: string;
  predicate: string;
};
type Rect = { x: number; y: number; width: number; height: number };
const ns = "http://www.w3.org/2000/svg";
function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
) {
  const element = document.createElementNS(ns, name);
  for (const [key, value] of Object.entries(attrs))
    element.setAttribute(key, String(value));
  return element;
}
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width + 6 &&
  a.x + a.width + 6 > b.x &&
  a.y < b.y + b.height + 5 &&
  a.y + a.height + 5 > b.y;

export class GraphView {
  private positions = new Map<string, Point>();
  private nodes: GraphNode[] = [];
  private edges: GraphEdge[] = [];
  private selected = "";
  private active = "";
  private camera = { x: 0, y: 0, scale: 1 };
  private width = 900;
  private height = 600;
  private dragging = new Map<number, Point>();
  private measure = document.createElement("canvas").getContext("2d")!;
  private pathMode = false;
  constructor(
    private svg: SVGSVGElement,
    private select: (id: string) => void,
    private inspect: (id: string) => void,
  ) {
    this.measure.font = "600 14px system-ui";
    new ResizeObserver(() => {
      if (!svg.clientWidth || !svg.clientHeight) return;
      this.width = svg.clientWidth;
      this.height = svg.clientHeight;
      this.fit();
    }).observe(svg);
    svg.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12);
      },
      { passive: false },
    );
    svg.addEventListener("pointerdown", (event) => {
      if ((event.target as Element).closest("[role=button]")) return;
      this.dragging.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener("pointermove", (event) => {
      const old = this.dragging.get(event.pointerId);
      if (!old) return;
      const other = [...this.dragging.entries()].find(
        ([id]) => id !== event.pointerId,
      )?.[1];
      if (other) {
        const before = Math.hypot(old.x - other.x, old.y - other.y);
        const after = Math.hypot(
          event.clientX - other.x,
          event.clientY - other.y,
        );
        if (before > 5)
          this.camera.scale = Math.max(
            0.25,
            Math.min(3, (this.camera.scale * after) / before),
          );
      } else {
        this.camera.x -= (event.clientX - old.x) / this.camera.scale;
        this.camera.y -= (event.clientY - old.y) / this.camera.scale;
      }
      this.dragging.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      this.draw();
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      svg.addEventListener(name, (event) =>
        this.dragging.delete((event as PointerEvent).pointerId),
      );
    svg.setAttribute("tabindex", "0");
    svg.addEventListener("keydown", (event) => {
      if (event.target !== svg) return;
      const shifts: Record<string, Point> = {
        ArrowLeft: { x: -40, y: 0 },
        ArrowRight: { x: 40, y: 0 },
        ArrowUp: { x: 0, y: -40 },
        ArrowDown: { x: 0, y: 40 },
      };
      if (shifts[event.key]) {
        event.preventDefault();
        this.camera.x += shifts[event.key].x / this.camera.scale;
        this.camera.y += shifts[event.key].y / this.camera.scale;
        this.draw();
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        this.zoom(1.2);
      }
      if (event.key === "-") {
        event.preventDefault();
        this.zoom(1 / 1.2);
      }
    });
    for (const [id, action] of [
      ["zoom-in", () => this.zoom(1.2)],
      ["zoom-out", () => this.zoom(1 / 1.2)],
      ["fit", () => this.fit()],
    ] as const) {
      const control = document.getElementById(id) as HTMLButtonElement;
      control.disabled = false;
      control.onclick = action;
    }
  }
  update(
    nodes: GraphNode[],
    edges: GraphEdge[],
    selected: string,
    active: string,
    reset = false,
    pathMode = false,
  ) {
    const started = performance.now();
    if (reset) this.positions.clear();
    const changed =
      nodes.length !== this.positions.size ||
      nodes.some((n) => !this.positions.has(n.id));
    this.nodes = nodes;
    this.edges = edges;
    this.selected = selected;
    this.active = active;
    this.pathMode = pathMode;
    if (pathMode && changed) {
      this.positions = new Map(
        nodes.map((n, i) => [n.id, { x: i * 240, y: i % 2 ? 35 : -35 }]),
      );
    } else if (changed)
      this.positions = layout(
        nodes.map((n) => n.id),
        edges,
        this.positions,
        selected,
      );
    if (changed) {
      const elapsed = performance.now() - started;
      this.svg.dataset.layoutMs = String(elapsed);
      this.svg.dataset.peakLayoutMs = String(
        Math.max(elapsed, Number(this.svg.dataset.peakLayoutMs || 0)),
      );
    }
    if (reset || !this.svg.childElementCount) this.fit();
    else this.draw();
  }
  fit() {
    const points = [...this.positions.values()];
    if (!points.length) {
      this.draw();
      return;
    }
    const minX = Math.min(...points.map((p) => p.x)),
      maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y)),
      maxY = Math.max(...points.map((p) => p.y));
    this.camera = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      scale: Math.max(
        0.25,
        Math.min(
          1.25,
          (this.width - 200) / Math.max(240, maxX - minX),
          (this.height - 220) / Math.max(220, maxY - minY),
        ),
      ),
    };
    this.draw();
  }
  zoom(factor: number) {
    this.camera.scale = Math.max(0.25, Math.min(3, this.camera.scale * factor));
    this.draw();
  }
  private draw() {
    const focus = (document.activeElement as SVGElement)?.dataset?.node;
    this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
    this.svg.replaceChildren();
    const defs = el("defs");
    for (const [name, color] of [
      ["reference", "#64748b"],
      ["fact", "#08766b"],
      ["active", "#2856d8"],
    ]) {
      const marker = el("marker", {
        id: `arrow-${name}`,
        viewBox: "0 0 10 10",
        refX: 9,
        refY: 5,
        markerWidth: 7,
        markerHeight: 7,
        orient: "auto-start-reverse",
        markerUnits: "userSpaceOnUse",
      });
      marker.append(el("path", { d: "M0 0 L10 5 L0 10 Z", fill: color }));
      defs.append(marker);
    }
    this.svg.append(defs);
    const coords = new Map(
      [...this.positions].map(([id, p]) => [
        id,
        {
          x: (p.x - this.camera.x) * this.camera.scale + this.width / 2,
          y: (p.y - this.camera.y) * this.camera.scale + this.height / 2,
        },
      ]),
    );
    const nodeById = new Map(this.nodes.map((n) => [n.id, n]));
    const pairs = new Map<string, GraphEdge[]>();
    for (const e of this.edges) {
      const key = [e.subject, e.object].sort().join("|");
      pairs.set(key, [...(pairs.get(key) || []), e]);
    }
    const edgeLabelRects: Rect[] = [];
    for (const edge of this.edges) {
      const a = coords.get(edge.subject),
        b = coords.get(edge.object);
      if (!a || !b) continue;
      const siblings = pairs.get([edge.subject, edge.object].sort().join("|"))!;
      const index = siblings.indexOf(edge);
      const sign = edge.subject < edge.object ? 1 : -1;
      const bend =
        siblings.length > 1
          ? (index - (siblings.length - 1) / 2) * 32 * sign
          : 0;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        distance = Math.max(1, Math.hypot(dx, dy));
      const cx = (a.x + b.x) / 2 - (dy / distance) * bend,
        cy = (a.y + b.y) / 2 + (dx / distance) * bend;
      const ar = edge.subject === this.selected ? 24 : 16,
        br = edge.object === this.selected ? 27 : 19;
      const ad = Math.max(1, Math.hypot(cx - a.x, cy - a.y)),
        bd = Math.max(1, Math.hypot(b.x - cx, b.y - cy));
      const d =
        edge.subject === edge.object
          ? `M${a.x - 12} ${a.y - 12} C${a.x - 65} ${a.y - 85} ${a.x + 65} ${a.y - 85} ${a.x + 12} ${a.y - 18}`
          : `M${a.x + ((cx - a.x) / ad) * ar} ${a.y + ((cy - a.y) / ad) * ar} Q${cx} ${cy} ${b.x - ((b.x - cx) / bd) * br} ${b.y - ((b.y - cy) / bd) * br}`;
      const isActive = edge.id === this.active,
        kind = isActive
          ? "active"
          : edge.predicate === "linksTo"
            ? "reference"
            : "fact";
      const group = el("g", { "data-edge": edge.id });
      const path = el("path", {
        d,
        fill: "none",
        stroke:
          kind === "active"
            ? "#2856d8"
            : kind === "fact"
              ? "#08766b"
              : "#64748b",
        "stroke-width": isActive ? 2.8 : kind === "fact" ? 2 : 1.2,
        "marker-end": `url(#arrow-${kind})`,
        opacity:
          this.active && !isActive
            ? 0.25
            : !this.pathMode &&
                edge.subject !== this.selected &&
                edge.object !== this.selected
              ? 0.22
              : 1,
      });
      if (edge.predicate === "linksTo")
        path.setAttribute("stroke-dasharray", "5 5");
      const hit = el("path", {
        d,
        fill: "none",
        stroke: "transparent",
        "stroke-width": 14,
        role: "button",
        tabindex: -1,
        "aria-label": `Inspect ${nodeById.get(edge.subject)?.label} ${edge.predicate} ${nodeById.get(edge.object)?.label}`,
      });
      hit.onclick = () => this.inspect(edge.id);
      const title = el("title");
      title.textContent = `${nodeById.get(edge.subject)?.label} → ${edge.predicate} → ${nodeById.get(edge.object)?.label}`;
      group.append(path, hit, title);
      this.svg.append(group);
      if (
        (this.edges.length <= 8 &&
          (edge.predicate !== "linksTo" || this.pathMode)) ||
        isActive
      ) {
        const relation: Record<string, string> = {
          linksTo: "links to",
          designedBy: "designed by",
          developedBy: "developed by",
          influencedBy: "influenced by",
        };
        const name = relation[edge.predicate] || edge.predicate;
        const width = this.measure.measureText(name).width + 20;
        const rect = { x: cx - width / 2, y: cy - 30, width, height: 25 };
        const clear = [...coords.values()].every(
          (p) =>
            !overlaps(rect, {
              x: p.x - 27,
              y: p.y - 27,
              width: 54,
              height: 54,
            }),
        );
        if (
          clear &&
          rect.x > 12 &&
          rect.y > 62 &&
          rect.x + width < this.width - 12 &&
          rect.y + 25 < this.height - 57 &&
          !edgeLabelRects.some((old) => overlaps(rect, old))
        ) {
          edgeLabelRects.push(rect);
          const label = el("g", { "pointer-events": "none" });
          label.append(
            el("rect", {
              ...rect,
              rx: 5,
              fill: isActive ? "#edf2ff" : "#e5f3ee",
            }),
          );
          const text = el("text", {
            x: cx,
            y: rect.y + 17,
            "text-anchor": "middle",
          });
          text.style.fontSize = "12px";
          text.style.fill = isActive ? "#2856d8" : "#07685d";
          text.textContent = name;
          label.append(text);
          this.svg.append(label);
        }
      }
    }
    const labelRects: Rect[] = [...edgeLabelRects];
    const obstacles = [...coords].map(([id, p]) => ({
      x: p.x - 20,
      y: p.y - 20,
      width: 40,
      height: 40,
    }));
    const ordered = [...this.nodes].sort(
      (a, b) => Number(b.id === this.selected) - Number(a.id === this.selected),
    );
    for (const node of ordered) {
      const p = coords.get(node.id)!;
      if (
        p.x < -30 ||
        p.x > this.width + 30 ||
        p.y < -30 ||
        p.y > this.height + 30
      )
        continue;
      const selected = node.id === this.selected;
      const group = el("g", {
        role: "button",
        tabindex: 0,
        "aria-label": `Select ${node.label}`,
        "aria-pressed": String(selected),
        "data-node": node.id,
      });
      if (selected)
        group.append(
          el("circle", {
            cx: p.x,
            cy: p.y,
            r: 25,
            fill: "#edf2ff",
            stroke: "#2856d8",
            "stroke-width": 1.5,
          }),
        );
      group.append(
        el("circle", {
          cx: p.x,
          cy: p.y,
          r: selected ? 17 : 11,
          fill: selected ? "#2856d8" : "#fff",
          stroke: selected ? "#2856d8" : "#64748b",
          "stroke-width": 2,
        }),
      );
      const title = el("title");
      title.textContent = node.label;
      group.append(title);
      group.onclick = () => this.select(node.id);
      group.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.select(node.id);
        }
      };
      group.onfocus = () => {
        document.getElementById("graph-hint")!.textContent = node.label;
      };
      this.svg.append(group);
      const lines: string[] = [""];
      for (const word of node.label.split(" ")) {
        const i = lines.length - 1,
          candidate = lines[i] ? lines[i] + " " + word : word;
        if (this.measure.measureText(candidate).width > 175 && lines[i])
          lines.push(word);
        else lines[i] = candidate;
      }
      // Long unbroken titles remain available in the inspector and title tooltip.
      if (lines.length > 3 && !selected) continue;
      const width = Math.min(
          this.width - 40,
          Math.max(
            ...lines.map((line) => this.measure.measureText(line).width),
          ) + 12,
        ),
        height = lines.length * 18 + 8;
      if (width > 220 && !selected) continue;
      const candidates = [
        { x: p.x - width / 2, y: p.y + 31, width, height },
        { x: p.x - width / 2, y: p.y - 32 - height, width, height },
        { x: p.x + 31, y: p.y - height / 2, width, height },
        { x: p.x - width - 31, y: p.y - height / 2, width, height },
      ];
      let rect = candidates.find(
        (r) =>
          r.x >= 12 &&
          r.x + r.width <= this.width - 12 &&
          r.y >= 62 &&
          r.y + r.height <= this.height - 57 &&
          !labelRects.some((old) => overlaps(r, old)) &&
          !obstacles.some((old) => overlaps(r, old)),
      );
      if (!rect && selected) {
        // Keep the selected name readable even when every nearby placement is occupied.
        const fallback = { x: 16, y: 66, width, height };
        rect = fallback;
        this.svg.append(
          el("path", {
            d: `M${p.x} ${p.y} L${rect.x + rect.width / 2} ${rect.y + rect.height}`,
            stroke: "#2856d8",
            "stroke-width": 1,
            "stroke-dasharray": "3 4",
            fill: "none",
            "pointer-events": "none",
          }),
        );
      }
      if (!rect) continue;
      labelRects.push(rect);
      const label = el("g", {
        "data-label": node.id,
        "pointer-events": "none",
      });
      label.append(
        el("rect", { ...rect, rx: 5, fill: "#fafbfd", opacity: 0.96 }),
      );
      lines.forEach((line, i) => {
        const text = el("text", {
          x: rect.x + rect.width / 2,
          y: rect.y + 18 + i * 18,
          "text-anchor": "middle",
          "font-weight": selected ? 700 : 500,
        });
        text.textContent = line;
        label.append(text);
      });
      this.svg.append(label);
    }
    if (focus)
      this.svg
        .querySelector<SVGElement>(`[data-node="${CSS.escape(focus)}"]`)
        ?.focus({ preventScroll: true });
    this.svg.dataset.visibleLabels = String(labelRects.length);
  }
}
