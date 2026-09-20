/** Theme changes redraw cached Canvas colors without rebuilding the user's map. */
export function setupTheme(refresh: () => void) {
  const root = document.documentElement;
  const button = document.getElementById("theme-toggle")!;
  const media = matchMedia("(prefers-color-scheme: light)");
  let explicit = false;
  try {
    explicit = ["light", "dark"].includes(
      localStorage.getItem("wikigraph-theme") || "",
    );
  } catch {}
  const apply = (theme: string) => {
    root.dataset.theme = theme;
    const label = `Switch to ${theme === "dark" ? "light" : "dark"} theme`;
    button.setAttribute("aria-label", label);
    button.title = label;
    document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    )!.content = theme === "light" ? "#f1f4f8" : "#0c1017";
    refresh();
  };
  button.onclick = () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    explicit = true;
    try {
      localStorage.setItem("wikigraph-theme", next);
    } catch {}
    apply(next);
  };
  media.addEventListener("change", () => {
    if (!explicit) apply(media.matches ? "light" : "dark");
  });
  apply(root.dataset.theme || "dark");
}
