/** Shared ranking for the search box and path destination picker. */
export function rankEntities<
  T extends { id: string; label: string; aliases: string[] },
>(items: T[], query: string): T[] {
  const q = query.trim().toLocaleLowerCase();
  const rank = (item: T) =>
    Math.min(
      ...[item.label, ...item.aliases].map((value) => {
        const name = value.toLocaleLowerCase();
        return name === q
          ? 0
          : name.startsWith(q)
            ? 1
            : name.includes(q)
              ? 2
              : 3;
      }),
    );
  return items
    .filter((item) => rank(item) < 3)
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        a.label.localeCompare(b.label) ||
        a.id.localeCompare(b.id),
    );
}
