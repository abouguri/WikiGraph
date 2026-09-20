import type { GraphEdge } from "./encode";
export type Point = { x: number; y: number };
export type Body = Point & {
  vx: number;
  vy: number;
  radius: number;
  pinned: boolean;
  held: boolean;
};
export type LayoutLink = { source: string; target: string; weight: number };
export class Simulation {
  bodies = new Map<string, Body>();
  links: LayoutLink[] = [];
  alpha = 0;
  paused = false;
  private iterations = 0;
  update(
    ids: string[],
    edges: GraphEdge[],
    extra: LayoutLink[],
    anchor: string,
    reset = false,
  ) {
    const old = reset ? new Map<string, Body>() : this.bodies;
    const center = old.get(anchor) || { x: 0, y: 0 };
    this.bodies = new Map<string, Body>(
      ids.map((id, i): [string, Body] => {
        const prior = old.get(id);
        if (prior) return [id, { ...prior, held: true }];
        const angle = i * 2.399963;
        return [
          id,
          {
            x: center.x + Math.cos(angle) * (50 + Math.sqrt(i) * 30),
            y: center.y + Math.sin(angle) * (50 + Math.sqrt(i) * 30),
            vx: 0,
            vy: 0,
            radius: 14,
            pinned: false,
            held: false,
          },
        ];
      }),
    );
    this.links = [
      ...edges.map((e) => ({
        source: e.subject,
        target: e.object,
        weight: e.predicate === "linksTo" ? 0.25 : 0.8,
      })),
      ...extra,
    ];
    this.reheat();
  }
  reheat() {
    this.alpha = 1;
    this.iterations = 0;
  }
  rearrange() {
    for (const b of this.bodies.values()) b.held = false;
    this.reheat();
  }
  pin(id: string, p: Point) {
    const b = this.bodies.get(id);
    if (b) {
      Object.assign(b, p, { vx: 0, vy: 0, pinned: true, held: false });
      this.reheat();
    }
  }
  unpin(id: string) {
    const b = this.bodies.get(id);
    if (b) {
      b.pinned = false;
      b.held = false;
      this.reheat();
    }
  }
  tick() {
    if (this.paused || this.alpha < 0.003) return false;
    const bodies = [...this.bodies.values()];
    const a = this.alpha;
    for (let i = 0; i < bodies.length; i++) {
      const p = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const q = bodies[j];
        let dx = q.x - p.x,
          dy = q.y - p.y,
          d = Math.hypot(dx, dy);
        if (d < 0.01) {
          dx = 0.1 * (i + 1);
          dy = 0.1;
          d = Math.hypot(dx, dy);
        }
        const force = Math.min(12, 1800 / (d * d)) * a;
        const overlap = Math.max(0, p.radius + q.radius + 12 - d) * 0.15;
        const fx = (dx / d) * (force + overlap),
          fy = (dy / d) * (force + overlap);
        p.vx -= fx;
        p.vy -= fy;
        q.vx += fx;
        q.vy += fy;
      }
    }
    for (const link of this.links) {
      const p = this.bodies.get(link.source),
        q = this.bodies.get(link.target);
      if (!p || !q || p === q) continue;
      const dx = q.x - p.x,
        dy = q.y - p.y,
        d = Math.max(1, Math.hypot(dx, dy)),
        rest = 150 - 105 * Math.max(0, Math.min(1, link.weight)),
        f = (d - rest) * (0.006 + 0.02 * link.weight) * a;
      const fx = (dx / d) * f,
        fy = (dy / d) * f;
      p.vx += fx;
      p.vy += fy;
      q.vx -= fx;
      q.vy -= fy;
    }
    for (const p of bodies) {
      if (p.pinned || p.held) {
        p.vx = p.vy = 0;
        continue;
      }
      p.vx = (p.vx - p.x * 0.0007 * a) * 0.75;
      p.vy = (p.vy - p.y * 0.0007 * a) * 0.75;
      p.x += Math.max(-12, Math.min(12, p.vx));
      p.y += Math.max(-12, Math.min(12, p.vy));
    }
    this.alpha *= 0.976;
    this.iterations++;
    if (this.iterations >= 300) this.alpha = 0;
    return this.alpha >= 0.003;
  }
  settle() {
    const paused = this.paused;
    this.paused = false;
    for (let i = 0; i < 300; i++) if (!this.tick()) break;
    this.paused = paused;
  }
  positions() {
    return new Map([...this.bodies].map(([id, p]) => [id, { x: p.x, y: p.y }]));
  }
}
