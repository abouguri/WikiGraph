// Apply the preference before CSS paints; storage may be unavailable in private contexts.
(() => {
  let saved;
  try {
    saved = localStorage.getItem("wikigraph-theme");
  } catch {}
  const theme =
    saved === "light" || saved === "dark"
      ? saved
      : matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content =
    theme === "light" ? "#f1f4f8" : "#0c1017";
})();
