import { test, expect } from "@playwright/test";
import { readURL } from "../src/url";
import { nodeRadius, nodeColor } from "../src/encode";
import { edgePoints } from "../src/geometry";
test("URL parser clamps bounds, ignores unknown fields and handles malformed data", () => {
  const value = readURL({
    search: "?mode=offline",
    hash: "#d=wikipedia&o=a,b,c,d&n=1000&c=unknown&z=bad&y=2005-1990&pins=bad&v=NaN,2,1&unknown=x",
  });
  expect(value.dataset).toBe("api");
  expect(value.origins).toEqual(["a", "b", "c"]);
  expect(value.mapSize).toBe(80);
  expect(value.years).toEqual([1990, 2005]);
  expect(value.pins).toEqual([]);
  expect(value.camera).toBeUndefined();
  expect(value.color).toBe("type");
  expect(value.size).toBe("links");
});
test("encodings are monotonic and years use the available extent", () => {
  expect(nodeRadius(25, 100, 1)).toBeGreaterThan(nodeRadius(1, 100, 1));
  expect(nodeRadius(100, 100, 1)).toBe(14);
  const palette = {
    "year-start": "#000000",
    "year-end": "#ffffff",
    other: "#888888",
    language: "#123456",
  };
  expect(
    nodeColor(
      { id: "a", label: "A", year: 1980 },
      "year",
      palette,
      [1980, 2000],
    ),
  ).toBe("#000000");
  expect(
    nodeColor(
      { id: "b", label: "B", year: 2000 },
      "year",
      palette,
      [1980, 2000],
    ),
  ).toBe("#ffffff");
  expect(nodeColor({ id: "c", label: "C" }, "type", palette)).toBe("#888888");
});
test("parallel edges and self-loops have distinct inspectable geometry", () => {
  const a = { x: 0, y: 0 },
    b = { x: 100, y: 0 },
    up = edgePoints(a, b, 24),
    down = edgePoints(a, b, -24);
  expect(up[6].y).toBeGreaterThan(0);
  expect(down[6].y).toBeLessThan(0);
  expect(edgePoints(a, a, 0, true).length).toBeGreaterThan(2);
});
