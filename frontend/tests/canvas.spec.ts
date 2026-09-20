import { test, expect } from "@playwright/test";
import { HitGrid, distanceToSegment } from "../src/hit";
test("hit grid chooses nearest node and segment distance clamps endpoints", () => {
  const grid = new HitGrid();
  grid.reset([
    { id: "a", x: 39, y: 40, r: 8 },
    { id: "b", x: 50, y: 40, r: 8 },
  ]);
  expect(grid.find({ x: 42, y: 40 })?.id).toBe("a");
  expect(grid.find({ x: 200, y: 40 })).toBeUndefined();
  expect(
    distanceToSegment({ x: 15, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 }),
  ).toBeCloseTo(Math.sqrt(41));
});
test("canvas renders and becomes idle after interaction", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#d=teaching&o=fixture-1");
  await expect(page.locator("#graph")).toHaveAttribute("data-nodes", /[1-9]/);
  await page.locator("#zoom-in").click();
  await page.locator("#fit").click();
  await page.waitForTimeout(550);
  const frames = await page.locator("#graph").getAttribute("data-frames");
  await page.waitForTimeout(200);
  expect(await page.locator("#graph").getAttribute("data-frames")).toBe(frames);
});

import { Simulation } from "../src/sim";
test("simulation preserves expanded positions, pins and terminates", () => {
  const s = new Simulation();
  s.update(
    ["a", "b"],
    [{ id: "e", subject: "a", object: "b", predicate: "linksTo" }],
    [],
    "a",
    true,
  );
  s.settle();
  const a = { ...s.bodies.get("a")! };
  s.update(["a", "b", "c"], [], [], "a");
  s.settle();
  expect(s.bodies.get("a")!.x).toBe(a.x);
  s.pin("c", { x: 22, y: 33 });
  s.rearrange();
  s.settle();
  expect(s.bodies.get("c")!.x).toBe(22);
  expect(s.tick()).toBe(false);
  s.unpin("c");
  s.settle();
  expect(s.bodies.get("c")!.x).not.toBe(22);
});
