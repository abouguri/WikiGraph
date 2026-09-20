export type Point = { x: number; y: number };
export type Mark = Point & { id: string; r: number };
export function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    d = dx * dx + dy * dy,
    t = d
      ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / d))
      : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export class HitGrid {
  private cells = new Map<string, Mark[]>();
  reset(marks: Mark[]) {
    this.cells.clear();
    for (const m of marks) {
      const key = `${Math.floor(m.x / 40)},${Math.floor(m.y / 40)}`;
      this.cells.set(key, [...(this.cells.get(key) || []), m]);
    }
  }
  find(p: Point) {
    let best: Mark | undefined,
      distance = Infinity;
    const x = Math.floor(p.x / 40),
      y = Math.floor(p.y / 40);
    for (let i = x - 1; i <= x + 1; i++)
      for (let j = y - 1; j <= y + 1; j++)
        for (const m of this.cells.get(`${i},${j}`) || []) {
          const d = Math.hypot(p.x - m.x, p.y - m.y);
          if (d <= Math.max(10, m.r + 4) && d < distance) {
            best = m;
            distance = d;
          }
        }
    return best;
  }
}
