import { edgePoints } from "./geometry";
import { Simulation, type Point, type LayoutLink } from "./sim";
import { simulationToolbar } from "./panels/toolbar";
import {
  readPalette,
  nodeRadius,
  nodeColor,
  type GraphNode,
  type GraphEdge,
} from "./encode";
import { HitGrid, distanceToSegment, type Mark } from "./hit";
export type { GraphNode, GraphEdge } from "./encode";
type Camera = { x: number; y: number; scale: number };
type Rect = { x: number; y: number; width: number; height: number };
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width + 5 &&
  a.x + a.width + 5 > b.x &&
  a.y < b.y + b.height + 4 &&
  a.y + a.height + 4 > b.y;
export class GraphView {
  positions = new Map<string, Point>();
  private sim = new Simulation();
  private simFrame = 0;
  private returnFrame = 0;
  private returnTarget: Map<string, Point> | undefined;
  private fastSettle = false;
  private layoutLinks: LayoutLink[] = [];
  private savedPositions = new Map<string, Point>();
  protected nodes: GraphNode[] = [];
  protected edges: GraphEdge[] = [];
  protected selected = "";
  protected active = "";
  camera: Camera = { x: 0, y: 0, scale: 1 };
  protected width = 900;
  protected height = 600;
  protected pathMode = false;
  protected ctx: CanvasRenderingContext2D;
  protected palette = readPalette();
  protected frame = 0;
  protected hovered = "";
  protected colorBy = "type";
  protected sizeBy = "links";
  protected hidden = new Set<string>();
  private filteredEdges = new Set<string>();
  protected marks: Mark[] = [];
  protected grid = new HitGrid();
  private scene = document.createElement("canvas");
  private sceneKey = "";
  private scenePositions: Map<string, Point> | undefined;
  private sceneNodes: GraphNode[] | undefined;
  private sceneEdges: GraphEdge[] | undefined;
  private sceneHidden: Set<string> | undefined;
  private sceneFiltered: Set<string> | undefined;
  private sceneCamera: Camera = { x: 0, y: 0, scale: 0 };
  private sprites = new Map<string, HTMLCanvasElement>();
  private pointers = new Map<number, Point>();
  private start: Point | undefined;
  private moved = false;
  private fitFrame = 0;
  private edgeMarks: {
    edge: GraphEdge;
    a: Point;
    b: Point;
    points: Point[];
  }[] = [];
  private longPress: ReturnType<typeof setTimeout> | undefined;
  onContext: (id: string) => void = () => {};
  onHover: (id: string) => void = () => {};
  onExpand: (id: string) => void = () => {};
  onClear: () => void = () => {};
  onCamera: () => void = () => {};
  onBrush: (ids: string[]) => void = () => {};
  protected dragNode = "";
  protected brush: Point | undefined;
  private tooltip: HTMLDivElement;
  refreshTheme() {
    this.palette = readPalette();
    this.sprites.clear();
    this.sceneKey = "";
    this.requestDraw();
  }

  constructor(
    protected canvas: HTMLCanvasElement,
    protected select: (id: string) => void,
    protected inspect: (id: string) => void,
  ) {
    this.ctx = canvas.getContext("2d")!;
    const toolbar = document.querySelector<HTMLElement>(".zoom-controls");
    if (toolbar)
      simulationToolbar(
        toolbar,
        (p) => {
          this.sim.paused = p;
          if (!p) this.runSimulation();
        },
        () => {
          this.sim.rearrange();
          this.runSimulation();
        },
      );
    this.tooltip = document.createElement("div");
    this.tooltip.className = "graph-tooltip";
    this.tooltip.hidden = true;
    canvas.parentElement!.append(this.tooltip);
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "application");
    canvas.setAttribute(
      "aria-label",
      "Knowledge map. Arrow keys select connected entities; Enter expands. Use the Map and Connections lists for equivalent actions.",
    );
    new ResizeObserver(() => {
      if (!canvas.clientWidth || !canvas.clientHeight) return;
      this.width = canvas.clientWidth;
      this.height = canvas.clientHeight;
      const dpr = Math.min(devicePixelRatio || 1, 3);
      canvas.width = Math.round(this.width * dpr);
      canvas.height = Math.round(this.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.fit(false);
    }).observe(canvas);
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom(Math.exp(-e.deltaY * 0.0015), this.local(e));
      },
      { passive: false },
    );
    canvas.addEventListener("pointerdown", (e) => {
      this.cancelFit();
      const p = this.local(e);
      this.pointers.set(e.pointerId, p);
      this.start = p;
      this.moved = false;
      this.dragNode = this.grid.find(p)?.id || "";
      if (e.shiftKey) {
        this.brush = p;
        this.dragNode = "";
      }
      clearTimeout(this.longPress);
      if (
        e.pointerType === "touch" &&
        this.dragNode &&
        this.pointers.size === 1
      ) {
        const id = this.dragNode;
        this.longPress = setTimeout(() => {
          this.moved = true;
          this.onContext(id);
        }, 550);
      }
      if (this.pointers.size > 1) this.moved = true;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      const p = this.local(e),
        old = this.pointers.get(e.pointerId);
      if (!old) {
        this.hover(p);
        return;
      }
      const other = [...this.pointers].find(([id]) => id !== e.pointerId)?.[1];
      if (
        this.start &&
        Math.hypot(p.x - this.start.x, p.y - this.start.y) > 4
      ) {
        this.moved = true;
        clearTimeout(this.longPress);
      }
      if (other) {
        this.dragNode = "";
        const before = Math.hypot(old.x - other.x, old.y - other.y),
          after = Math.hypot(p.x - other.x, p.y - other.y);
        if (before > 5)
          this.zoom(after / before, {
            x: (p.x + other.x) / 2,
            y: (p.y + other.y) / 2,
          });
      } else if (this.brush) {
      } else if (this.dragNode && this.moved) {
        this.moveNode(this.dragNode, this.world(p));
      } else if (!this.dragNode) {
        this.camera.x -= (p.x - old.x) / this.camera.scale;
        this.camera.y -= (p.y - old.y) / this.camera.scale;
      }
      this.pointers.set(e.pointerId, p);
      this.requestDraw();
    });
    canvas.addEventListener("pointerup", (e) => {
      const p = this.local(e);
      if (this.brush) {
        const a = this.brush;
        this.onBrush(
          this.marks
            .filter(
              (m) =>
                !this.hidden.has(m.id) &&
                m.x >= Math.min(a.x, p.x) &&
                m.x <= Math.max(a.x, p.x) &&
                m.y >= Math.min(a.y, p.y) &&
                m.y <= Math.max(a.y, p.y),
            )
            .map((m) => m.id),
        );
      } else if (!this.moved && this.pointers.size === 1) {
        const hit = this.grid.find(p);
        if (hit) this.select(hit.id);
        else {
          const edge = this.edgeAt(p);
          if (edge) this.inspect(edge.id);
          else this.onClear();
        }
      }
      this.release(e.pointerId);
      this.onCamera();
    });
    for (const name of ["pointercancel", "lostpointercapture"])
      canvas.addEventListener(name, (e) =>
        this.release((e as PointerEvent).pointerId),
      );
    canvas.addEventListener("pointerleave", () => {
      if (!this.pointers.size) this.hover({ x: -999, y: -999 });
    });
    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const n = this.grid.find(this.local(e));
      if (n) this.onContext(n.id);
    });
    canvas.addEventListener("dblclick", (e) => {
      const n = this.grid.find(this.local(e));
      if (n) this.unpin(n.id);
    });
    canvas.addEventListener("keydown", (e) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const ids = [
          ...new Set(
            this.edges
              .filter(
                (x) =>
                  x.subject === this.selected || x.object === this.selected,
              )
              .flatMap((x) => [x.subject, x.object]),
          ),
        ].filter((id) => id !== this.selected && !this.hidden.has(id));
        const choices = ids.length
          ? ids
          : this.nodes.filter((n) => !this.hidden.has(n.id)).map((n) => n.id);
        const current = this.positions.get(this.selected);
        if (current && ids.length) {
          const direction =
            e.key === "ArrowLeft"
              ? [-1, 0]
              : e.key === "ArrowRight"
                ? [1, 0]
                : e.key === "ArrowUp"
                  ? [0, -1]
                  : [0, 1];
          choices.sort((a, b) => {
            const score = (id: string) => {
              const p = this.positions.get(id)!;
              const d = Math.hypot(p.x - current.x, p.y - current.y) || 1;
              return (
                ((p.x - current.x) * direction[0] +
                  (p.y - current.y) * direction[1]) /
                d
              );
            };
            return score(b) - score(a) || a.localeCompare(b);
          });
        }
        if (choices[0]) this.select(choices[0]);
      }
      if (e.key === "Enter" && this.selected) {
        e.preventDefault();
        this.onExpand(this.selected);
      }
      if (e.key === "f") {
        e.preventDefault();
        this.fit();
      }
      if (e.key === "Escape") this.onClear();
      if (e.key === "+" || e.key === "=") this.zoom(1.2);
      if (e.key === "-") this.zoom(1 / 1.2);
    });
    for (const [id, action] of [
      ["zoom-in", () => this.zoom(1.2)],
      ["zoom-out", () => this.zoom(1 / 1.2)],
      ["fit", () => this.fit()],
    ] as const) {
      const c = document.getElementById(id) as HTMLButtonElement;
      if (c) {
        c.disabled = false;
        c.onclick = action;
      }
    }
  }
  protected moveNode(id: string, p: Point) {
    this.sceneKey = "";
    this.sim.pin(id, p);
    this.positions.set(id, p);
    this.runSimulation();
  }
  protected unpin(id: string) {
    this.sim.unpin(id);
    this.runSimulation();
  }
  getPins() {
    return [...this.sim.bodies]
      .filter(([, b]) => b.pinned)
      .map(([id, b]) => ({ id, x: b.x, y: b.y }));
  }
  setPins(pins: { id: string; x: number; y: number }[]) {
    for (const p of pins)
      if (Number.isFinite(p.x) && Number.isFinite(p.y)) this.sim.pin(p.id, p);
    this.positions = this.sim.positions();
    this.requestDraw();
  }
  setLayoutLinks(links: LayoutLink[]) {
    this.layoutLinks = links;
  }
  private runSimulation() {
    if (this.pathMode || this.sim.paused) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.sim.settle();
      this.positions = this.sim.positions();
      this.requestDraw();
      return;
    }
    if (this.simFrame) return;
    const tick = () => {
      this.simFrame = 0;
      if (this.pathMode || this.sim.paused) return;
      let running = this.sim.tick();
      if (this.fastSettle)
        for (let i = 0; i < 19 && running; i++) running = this.sim.tick();
      this.positions = this.sim.positions();
      this.requestDraw();
      if (running) this.simFrame = requestAnimationFrame(tick);
    };
    this.simFrame = requestAnimationFrame(tick);
  }
  private release(id: number) {
    clearTimeout(this.longPress);
    this.pointers.delete(id);
    if (!this.pointers.size) {
      this.dragNode = "";
      this.brush = undefined;
      this.requestDraw();
    }
  }
  private local(e: { clientX: number; clientY: number }) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  protected world(p: Point): Point {
    return {
      x: (p.x - this.width / 2) / this.camera.scale + this.camera.x,
      y: (p.y - this.height / 2) / this.camera.scale + this.camera.y,
    };
  }
  protected screen(p: Point): Point {
    return {
      x: (p.x - this.camera.x) * this.camera.scale + this.width / 2,
      y: (p.y - this.camera.y) * this.camera.scale + this.height / 2,
    };
  }
  private hover(p: Point) {
    const mark = this.grid.find(p),
      id = mark?.id || "";
    this.tooltip.hidden = !mark;
    if (mark) {
      const n = this.nodes.find((n) => n.id === id)!;
      this.tooltip.textContent = `${n.label} · ${n.type || "Other"}${n.year ? ` · ${n.year}` : ""}${n.similarity !== undefined ? ` · ${Math.round(n.similarity * 100)}% similarity` : ""}`;
      this.tooltip.style.left = `${Math.min(this.width - 270, Math.max(12, p.x + 16))}px`;
      this.tooltip.style.top = `${Math.max(80, p.y - 40)}px`;
    }
    if (id !== this.hovered) {
      this.hovered = id;
      this.onHover(id);
      this.requestDraw();
    }
    this.canvas.style.cursor = mark
      ? "grab"
      : this.edgeAt(p)
        ? "pointer"
        : "default";
  }
  private edgeAt(p: Point) {
    return [...this.edgeMarks]
      .sort(
        (a, b) =>
          Number(a.edge.predicate === "linksTo") -
          Number(b.edge.predicate === "linksTo"),
      )
      .find(
        (m) =>
          !this.filteredEdges.has(m.edge.id) &&
          !this.hidden.has(m.edge.subject) &&
          !this.hidden.has(m.edge.object) &&
          m.points.some(
            (point, i) =>
              i > 0 && distanceToSegment(p, m.points[i - 1], point) <= 6,
          ),
      )?.edge;
  }
  update(
    nodes: GraphNode[],
    edges: GraphEdge[],
    selected: string,
    active: string,
    reset = false,
    pathMode = false,
  ) {
    if (this.returnTarget) {
      cancelAnimationFrame(this.returnFrame);
      this.positions = this.returnTarget;
      this.returnTarget = undefined;
    }
    const fromPositions = new Map(this.positions);
    const started = performance.now(),
      wasPath = this.pathMode;
    const changed =
      reset ||
      nodes.length !== this.nodes.length ||
      nodes.some((n) => !this.positions.has(n.id));
    if (pathMode && !wasPath) this.savedPositions = new Map(this.positions);
    this.nodes = nodes;
    this.edges = edges;
    this.selected = selected;
    this.active = active;
    this.pathMode = pathMode;
    if (pathMode) {
      cancelAnimationFrame(this.simFrame);
      this.simFrame = 0;
      this.positions = new Map(
        nodes.map((n, i) => [n.id, { x: i * 200, y: 0 }]),
      );
    } else if (changed || wasPath) {
      this.sim.update(
        nodes.map((n) => n.id),
        edges,
        this.layoutLinks,
        selected,
        reset && !wasPath,
      );
      if (wasPath) {
        for (const [id, p] of this.savedPositions) {
          const body = this.sim.bodies.get(id);
          if (body) Object.assign(body, p);
        }
      }
      // Start from a legible arrangement, then visibly settle without a burst at the origin.
      if (reset && !wasPath) for (let i = 0; i < 40; i++) this.sim.tick();
      this.fastSettle = !reset;
      this.positions = this.sim.positions();
      if (!wasPath) this.runSimulation();
      this.canvas.dataset.layoutMs = String(performance.now() - started);
    }
    if (reset || wasPath) this.fit(false);
    else this.requestDraw();
    if (
      wasPath &&
      !pathMode &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const target = this.positions,
        start = performance.now();
      this.returnTarget = target;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 240),
          ease = 1 - (1 - t) ** 3;
        this.positions = new Map(
          [...target].map(([id, end]) => {
            const from = fromPositions.get(id) || end;
            return [
              id,
              {
                x: from.x + (end.x - from.x) * ease,
                y: from.y + (end.y - from.y) * ease,
              },
            ];
          }),
        );
        this.requestDraw();
        if (t < 1) this.returnFrame = requestAnimationFrame(tick);
        else {
          this.positions = target;
          this.returnTarget = undefined;
          this.returnFrame = 0;
        }
      };
      this.returnFrame = requestAnimationFrame(tick);
    }
  }

  setEncoding(color: string, size: string) {
    this.colorBy = color;
    this.sizeBy = size;
    this.requestDraw();
  }
  setFilteredEdges(ids: Set<string>) {
    this.filteredEdges = ids;
    this.requestDraw();
  }
  setHidden(ids: Set<string>) {
    this.hidden = ids;
    this.requestDraw();
  }
  setHover(id: string) {
    this.hovered = id;
    this.requestDraw();
  }
  setCamera(camera: Camera) {
    if (
      [camera.x, camera.y, camera.scale].every(Number.isFinite) &&
      camera.scale > 0
    )
      this.camera = {
        ...camera,
        scale: Math.max(0.15, Math.min(5, camera.scale)),
      };
    this.requestDraw();
  }
  private cancelFit() {
    cancelAnimationFrame(this.fitFrame);
    this.fitFrame = 0;
  }
  fit(animate = true) {
    this.cancelFit();
    const points = [...this.positions.values()];
    if (!points.length) {
      this.requestDraw();
      return;
    }
    let left = 24,
      right = 24,
      top = 150,
      bottom = 100;
    if (this.width >= 900) {
      left = document
        .getElementById("left-panel")
        ?.classList.contains("collapsed")
        ? 24
        : this.width < 1100
          ? 300
          : 350;
      right = document
        .getElementById("inspector")
        ?.classList.contains("collapsed")
        ? 24
        : this.width < 1100
          ? 310
          : 390;
    } else {
      top = 320;
      const panel = document.getElementById("left-panel");
      bottom =
        panel && !panel.classList.contains("collapsed")
          ? Math.min(panel.getBoundingClientRect().height, this.height * 0.31) +
            110
          : 150;
    }
    const minX = Math.min(...points.map((p) => p.x)),
      maxX = Math.max(...points.map((p) => p.x)),
      minY = Math.min(...points.map((p) => p.y)),
      maxY = Math.max(...points.map((p) => p.y));
    const scale = Math.max(
      0.15,
      Math.min(
        1.5,
        (this.width - left - right - 100) / Math.max(180, maxX - minX),
        (this.height - top - bottom - 80) / Math.max(180, maxY - minY),
      ),
    );
    const target = {
      x: (minX + maxX) / 2 + (right - left) / (2 * scale),
      y: (minY + maxY) / 2 + (bottom - top) / (2 * scale),
      scale,
    };
    if (!animate || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.camera = target;
      this.requestDraw();
      return;
    }
    const from = { ...this.camera },
      start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 400),
        q = 1 - (1 - t) ** 3;
      this.camera = {
        x: from.x + (target.x - from.x) * q,
        y: from.y + (target.y - from.y) * q,
        scale: from.scale + (target.scale - from.scale) * q,
      };
      this.requestDraw();
      if (t < 1) this.fitFrame = requestAnimationFrame(tick);
      else {
        this.fitFrame = 0;
        this.onCamera();
      }
    };
    this.fitFrame = requestAnimationFrame(tick);
  }
  zoom(factor: number, at: Point = { x: this.width / 2, y: this.height / 2 }) {
    this.cancelFit();
    const before = this.world(at);
    this.camera.scale = Math.max(0.15, Math.min(5, this.camera.scale * factor));
    const after = this.world(at);
    this.camera.x += before.x - after.x;
    this.camera.y += before.y - after.y;
    this.requestDraw();
    this.onCamera();
  }
  protected requestDraw() {
    if (!this.frame)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.draw();
      });
  }
  private sprite(color: string) {
    let sprite = this.sprites.get(color);
    if (sprite) return sprite;
    sprite = document.createElement("canvas");
    sprite.width = sprite.height = 64;
    const c = sprite.getContext("2d")!,
      g = c.createRadialGradient(32, 32, 1, 32, 32, 32);
    g.addColorStop(0, color + "aa");
    g.addColorStop(0.3, color + "40");
    g.addColorStop(1, color + "00");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    this.sprites.set(color, sprite);
    return sprite;
  }
  protected draw() {
    const started = performance.now();
    let c = this.ctx;
    c.clearRect(0, 0, this.width, this.height);
    this.edgeMarks = [];
    const incoming = new Map<string, number>();
    for (const e of this.edges)
      incoming.set(e.object, (incoming.get(e.object) || 0) + 1);
    const connected = new Set([
      this.selected,
      ...this.edges
        .filter(
          (e) => e.subject === this.selected || e.object === this.selected,
        )
        .flatMap((e) => [e.subject, e.object]),
    ]);
    const degrees = new Map<string, number>();
    for (const e of this.edges) {
      degrees.set(e.subject, (degrees.get(e.subject) || 0) + 1);
      degrees.set(e.object, (degrees.get(e.object) || 0) + 1);
    }
    const values = this.nodes.map((n) =>
      this.sizeBy === "uniform"
        ? 1
        : this.sizeBy === "degree"
          ? degrees.get(n.id) || 0
          : (n.in_links ?? incoming.get(n.id) ?? 0),
    );
    const max = Math.max(1, ...values);
    this.marks = this.nodes.flatMap((n) => {
      const p = this.positions.get(n.id);
      return p
        ? [
            {
              ...this.screen(p),
              id: n.id,
              r: nodeRadius(
                this.sizeBy === "uniform"
                  ? 1
                  : this.sizeBy === "degree"
                    ? degrees.get(n.id) || 0
                    : (n.in_links ?? incoming.get(n.id) ?? 0),
                max,
                this.camera.scale,
              ),
            },
          ]
        : [];
    });
    const byId = new Map(this.marks.map((m) => [m.id, m]));
    const byNode = new Map(this.nodes.map((n) => [n.id, n]));
    const pairs = new Map<string, GraphEdge[]>();
    for (const e of this.edges) {
      const key = [e.subject, e.object].sort().join("|");
      pairs.set(key, [...(pairs.get(key) || []), e]);
    }
    const geometry = new Map<string, Point[]>();
    for (const siblings of pairs.values()) {
      siblings.sort((a, b) => a.id.localeCompare(b.id));
      for (const [i, e] of siblings.entries()) {
        const a = byId.get(e.subject),
          b = byId.get(e.object);
        if (!a || !b) continue;
        const sign = e.subject < e.object ? 1 : -1;
        geometry.set(
          e.id,
          edgePoints(
            a,
            b,
            (i - (siblings.length - 1) / 2) * 24 * sign,
            e.subject === e.object,
          ),
        );
      }
    }
    this.edgeMarks = this.edges.flatMap((edge) => {
      const a = byId.get(edge.subject),
        b = byId.get(edge.object),
        points = geometry.get(edge.id);
      return a && b && points ? [{ edge, a, b, points }] : [];
    });
    // Reuse the settled mark layer while panning; labels and hit geometry stay live.
    const padding = 192,
      dpr = Math.min(devicePixelRatio || 1, 2),
      key = [
        this.selected,
        this.active,
        this.hovered,
        this.colorBy,
        this.sizeBy,
        this.pathMode,
        this.width,
        this.height,
        this.camera.scale,
      ].join("|");
    const dx = (this.sceneCamera.x - this.camera.x) * this.camera.scale,
      dy = (this.sceneCamera.y - this.camera.y) * this.camera.scale;
    const cached =
      this.sceneKey === key &&
      this.scenePositions === this.positions &&
      this.sceneNodes === this.nodes &&
      this.sceneEdges === this.edges &&
      this.sceneHidden === this.hidden &&
      this.sceneFiltered === this.filteredEdges &&
      Math.abs(dx) < padding &&
      Math.abs(dy) < padding;
    if (!cached) {
      this.scene.width = Math.ceil((this.width + padding * 2) * dpr);
      this.scene.height = Math.ceil((this.height + padding * 2) * dpr);
      c = this.scene.getContext("2d")!;
      c.setTransform(dpr, 0, 0, dpr, padding * dpr, padding * dpr);
      const trace = (points: Point[]) => {
        c.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++)
          c.lineTo(points[i].x, points[i].y);
      };
      for (const fact of [false, true])
        for (const faded of [false, true]) {
          c.strokeStyle = fact ? this.palette.fact : this.palette.other;
          c.lineWidth = fact ? 1.5 : 0.75;
          c.setLineDash(fact ? [] : [3, 5]);
          c.beginPath();
          for (const e of this.edges) {
            if ((e.predicate !== "linksTo") !== fact) continue;
            const a = byId.get(e.subject),
              b = byId.get(e.object);
            if (!a || !b) continue;
            const dim =
              this.filteredEdges.has(e.id) ||
              this.hidden.has(e.subject) ||
              this.hidden.has(e.object);
            if (dim !== faded) continue;
            const points = geometry.get(e.id)!;
            trace(points);
          }
          c.globalAlpha =
            (fact ? 0.85 : Number(this.palette["reference-opacity"]) || 0.28) *
            (faded ? 0.12 : 1);
          c.stroke();
        }
      c.setLineDash([]);
      for (const m of this.edgeMarks) {
        const e = m.edge,
          focused =
            this.pathMode ||
            e.id === this.active ||
            e.subject === this.hovered ||
            e.object === this.hovered,
          fact = e.predicate !== "linksTo",
          dim =
            this.filteredEdges.has(e.id) ||
            this.hidden.has(e.subject) ||
            this.hidden.has(e.object);
        if (dim || (!focused && !fact)) continue;
        c.globalAlpha = focused ? 1 : 0.85;
        c.strokeStyle = c.fillStyle = fact
          ? this.palette.fact
          : e.id === this.active
            ? this.palette.accent
            : this.palette.other;
        if (focused) {
          c.lineWidth = 2;
          c.beginPath();
          trace(m.points);
          c.stroke();
        }
        const end = m.points.at(-1)!,
          before = m.points.at(-2)!;
        const angle = Math.atan2(end.y - before.y, end.x - before.x),
          r = (byId.get(e.object)?.r || 5) + 5,
          x = end.x - Math.cos(angle) * r,
          y = end.y - Math.sin(angle) * r;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - Math.cos(angle - 0.5) * 7, y - Math.sin(angle - 0.5) * 7);
        c.lineTo(x - Math.cos(angle + 0.5) * 7, y - Math.sin(angle + 0.5) * 7);
        c.fill();
        if (fact) {
          c.beginPath();
          const midpoint =
            m.points.length === 2
              ? { x: (m.a.x + m.b.x) / 2, y: (m.a.y + m.b.y) / 2 }
              : m.points[Math.floor(m.points.length / 2)];
          c.arc(midpoint.x, midpoint.y, 3, 0, Math.PI * 2);
          c.fill();
        }
      }
      const dated = this.nodes.flatMap((n) => (n.year == null ? [] : [n.year]));
      const yearRange: [number, number] = [
        Math.min(...dated),
        Math.max(...dated),
      ];
      c.globalCompositeOperation = "source-over";
      for (const m of this.marks) {
        const n = byNode.get(m.id)!,
          color = nodeColor(n, this.colorBy, this.palette, yearRange);
        const dim = this.hidden.has(m.id)
          ? 0.12
          : this.selected && !connected.has(m.id)
            ? 0.25
            : 1;
        c.globalAlpha = dim * (Number(this.palette["glow-opacity"]) || 0.22);
        c.drawImage(
          this.sprite(color),
          m.x - m.r * 3,
          m.y - m.r * 3,
          m.r * 6,
          m.r * 6,
        );
      }
      c.globalCompositeOperation = "source-over";
      for (const m of this.marks) {
        const body = this.sim.bodies.get(m.id);
        if (body) body.radius = m.r / this.camera.scale;
        const n = byNode.get(m.id)!,
          color = nodeColor(n, this.colorBy, this.palette, yearRange),
          dim = this.hidden.has(m.id)
            ? 0.12
            : this.selected && !connected.has(m.id)
              ? 0.25
              : 1;
        c.globalAlpha = dim;
        c.fillStyle = color;
        c.beginPath();
        c.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        c.fill();
        if (n.is_origin || m.id === this.selected || m.id === this.hovered) {
          c.strokeStyle =
            m.id === this.selected ? this.palette.text : this.palette.accent;
          c.lineWidth = 1.5;
          for (const extra of n.is_origin ? [4, 7] : [4]) {
            c.beginPath();
            c.arc(m.x, m.y, m.r + extra, 0, Math.PI * 2);
            c.stroke();
          }
        }
      }

      this.sceneKey = key;
      this.scenePositions = this.positions;
      this.sceneNodes = this.nodes;
      this.sceneEdges = this.edges;
      this.sceneHidden = this.hidden;
      this.sceneFiltered = this.filteredEdges;
      this.sceneCamera = { ...this.camera };
    }
    c = this.ctx;
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    c.drawImage(
      this.scene,
      (cached ? dx : 0) - padding,
      (cached ? dy : 0) - padding,
      this.width + padding * 2,
      this.height + padding * 2,
    );
    const rects: Rect[] = [];
    const blockers = [
      ...document.querySelectorAll<HTMLElement>(
        ".appbar,.contextbar,.map-panel:not(.collapsed),.evidence-panel:not(.collapsed),.canvas-top,.canvas-bottom,.panel-controls,.statusbar,#timeline:not([hidden])",
      ),
    ]
      .filter((e) => e.getClientRects().length)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
    c.font = `500 12px ${this.palette["font-ui"] || "system-ui"}`;
    c.textBaseline = "middle";
    const order = [...this.marks].sort((a, b) => {
      const priority = (m: Mark) =>
        m.id === this.selected
          ? 1e6
          : m.id === this.hovered
            ? 1e5
            : byNode.get(m.id)?.is_origin
              ? 1e4
              : m.r;
      return priority(b) - priority(a) || a.id.localeCompare(b.id);
    });
    for (const m of order) {
      if (this.hidden.has(m.id) || rects.length >= 60) continue;
      const n = byNode.get(m.id)!,
        important =
          n.is_origin || m.id === this.selected || m.id === this.hovered;
      if (!important && m.r < 3.5 && this.camera.scale < 0.5) continue;
      const name = n.label.length > 55 ? n.label.slice(0, 52) + "…" : n.label,
        w = c.measureText(name).width + 10,
        h = 20;
      const options = [
        { x: m.x + m.r + 9, y: m.y - h / 2, width: w, height: h },
        { x: m.x - w - m.r - 9, y: m.y - h / 2, width: w, height: h },
        { x: m.x - w / 2, y: m.y + m.r + 10, width: w, height: h },
        { x: m.x - w / 2, y: m.y - m.r - 30, width: w, height: h },
      ];
      let r = options.find(
        (r) =>
          r.x > 12 &&
          r.y > 80 &&
          r.x + r.width < this.width - 12 &&
          r.y + r.height < this.height - 60 &&
          !rects.some((old) => overlaps(r, old)) &&
          !blockers.some((old) => overlaps(r, old)) &&
          !this.marks.some(
            (other) =>
              other.id !== m.id &&
              overlaps(r, {
                x: other.x - other.r,
                y: other.y - other.r,
                width: other.r * 2,
                height: other.r * 2,
              }),
          ),
      );
      if (!r && important) {
        r = {
          x: Math.max(12, Math.min(this.width - w - 12, m.x - w / 2)),
          y: Math.max(85, Math.min(this.height - 85, m.y + 25)),
          width: w,
          height: h,
        };
        let fallback: Rect | undefined;
        let nearest = Infinity;
        for (let y = 175; y < this.height - 65; y += 24) {
          for (let x = 16; x < this.width - w - 12; x += Math.max(24, w / 2)) {
            const candidate = { x, y, width: w, height: h };
            if (
              ![...rects, ...blockers].some((old) => overlaps(candidate, old))
            ) {
              const distance = Math.hypot(
                candidate.x + w / 2 - m.x,
                candidate.y + h / 2 - m.y,
              );
              if (distance < nearest) {
                fallback = candidate;
                nearest = distance;
              }
            }
          }
        }
        if (!fallback) continue;
        r = fallback;
        c.globalAlpha = 0.5;
        c.lineWidth = 1;
        c.strokeStyle = this.palette.accent;
        c.beginPath();
        c.moveTo(m.x, m.y);
        c.lineTo(r.x + w / 2, r.y);
        c.stroke();
      }
      if (!r) continue;
      rects.push(r);
      c.globalAlpha = 1;
      c.lineJoin = "round";
      c.lineWidth = 4;
      c.strokeStyle = this.palette.canvas;
      c.strokeText(name, r.x + 5, r.y + 10);
      c.fillStyle = important ? this.palette.text : this.palette.muted;
      c.fillText(name, r.x + 5, r.y + 10);
    }
    if (this.brush && this.pointers.size) {
      const p = [...this.pointers.values()][0];
      c.globalAlpha = 0.18;
      c.fillStyle = this.palette.accent;
      c.fillRect(
        this.brush.x,
        this.brush.y,
        p.x - this.brush.x,
        p.y - this.brush.y,
      );
      c.globalAlpha = 1;
      c.strokeStyle = this.palette.accent;
      c.strokeRect(
        this.brush.x,
        this.brush.y,
        p.x - this.brush.x,
        p.y - this.brush.y,
      );
    }
    c.globalAlpha = 1;
    this.grid.reset(this.marks.filter((m) => !this.hidden.has(m.id)));
    this.canvas.dataset.visibleLabels = String(rects.length);
    this.canvas.dataset.drawMs = String(performance.now() - started);
    this.canvas.dataset.nodes = String(this.nodes.length);
    this.canvas.dataset.frames = String(
      Number(this.canvas.dataset.frames || 0) + 1,
    );
  }
}
