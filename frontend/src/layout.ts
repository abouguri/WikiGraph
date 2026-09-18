export type Point = { x: number; y: number };
export type Link = { subject: string; object: string };
const hash = (value: string) => {
  let h = 2166136261;
  for (const ch of value) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};

/** Seeded, bounded force layout. Existing positions stay fixed on expansion. */
export function layout(
  ids: string[],
  links: Link[],
  previous: Map<string, Point>,
  anchor: string,
): Map<string, Point> {
  if (ids.length === 2 && previous.size === 0) {
    const source =
      links.find((edge) => edge.subject !== edge.object)?.subject || ids[0];
    return new Map(
      ids.map((id) => [id, { x: id === source ? -150 : 150, y: 0 }]),
    );
  }
  const result = new Map<string, Point>();
  const pinned = new Set(previous.keys());
  const origin = previous.get(anchor) || { x: 0, y: 0 };
  ids.forEach((id, i) => {
    const old = previous.get(id);
    const angle = (hash(id) % 6283) / 1000 + i * 2.399963;
    const radius = 140 + (hash(id + "r") % 260);
    result.set(
      id,
      old
        ? { ...old }
        : id === anchor
          ? { ...origin }
          : {
              x: origin.x + Math.cos(angle) * radius,
              y: origin.y + Math.sin(angle) * radius,
            },
    );
  });
  pinned.add(anchor);
  for (let iteration = 0; iteration < 160; iteration++) {
    const forces = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = result.get(ids[i])!,
          b = result.get(ids[j])!;
        const dx = a.x - b.x || 0.01,
          dy = a.y - b.y || 0.01;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const strength = Math.min(
          35,
          26000 / (distance * distance) + Math.max(0, 100 - distance) * 0.35,
        );
        const fx = (dx / distance) * strength,
          fy = (dy / distance) * strength;
        forces.get(ids[i])!.x += fx;
        forces.get(ids[i])!.y += fy;
        forces.get(ids[j])!.x -= fx;
        forces.get(ids[j])!.y -= fy;
      }
    }
    for (const edge of links) {
      const a = result.get(edge.subject),
        b = result.get(edge.object);
      if (!a || !b || edge.subject === edge.object) continue;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        distance = Math.max(1, Math.hypot(dx, dy));
      const strength = (distance - 200) * 0.022;
      forces.get(edge.subject)!.x += (dx / distance) * strength;
      forces.get(edge.subject)!.y += (dy / distance) * strength;
      forces.get(edge.object)!.x -= (dx / distance) * strength;
      forces.get(edge.object)!.y -= (dy / distance) * strength;
    }
    const cooling = 1 - iteration / 190;
    for (const id of ids) {
      if (pinned.has(id)) continue;
      const p = result.get(id)!,
        f = forces.get(id)!;
      p.x +=
        Math.max(-15, Math.min(15, f.x - (p.x - origin.x) * 0.003)) * cooling;
      p.y +=
        Math.max(-15, Math.min(15, f.y - (p.y - origin.y) * 0.003)) * cooling;
    }
  }
  return result;
}
