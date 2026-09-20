import type { Point } from "./sim";
/** Sampled curves keep drawing and hit testing on exactly the same geometry. */
export function edgePoints(
  a: Point,
  b: Point,
  bend: number,
  self = false,
): Point[] {
  if (self) {
    const radius = 25;
    return Array.from({ length: 19 }, (_, i) => {
      const angle = Math.PI * 0.2 + (i / 18) * Math.PI * 1.6;
      return {
        x: a.x + Math.cos(angle) * radius,
        y: a.y - 22 + Math.sin(angle) * radius,
      };
    });
  }
  if (!bend) return [a, b];
  const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
  const c = {
    x: (a.x + b.x) / 2 - ((b.y - a.y) / distance) * bend,
    y: (a.y + b.y) / 2 + ((b.x - a.x) / distance) * bend,
  };
  return Array.from({ length: 13 }, (_, i) => {
    const t = i / 12;
    return {
      x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
      y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
    };
  });
}
