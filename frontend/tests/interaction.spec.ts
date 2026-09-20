import { test, expect } from "@playwright/test";
import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
const bundle = buildSync({
  stdin: {
    resolveDir: path.resolve("."),
    loader: "ts",
    contents: `import {GraphView} from './src/renderer';const nodes=[{id:'a',label:'Origin',is_origin:true},{id:'b',label:'Neighbor'}],edges=[{id:'fact',subject:'a',object:'b',predicate:'designedBy'},{id:'reference',subject:'a',object:'b',predicate:'linksTo'}];window.events={selected:'',edge:'',context:'',group:[]};const graph=new GraphView(document.querySelector('canvas'),id=>window.events.selected=id,id=>window.events.edge=id);graph.onContext=id=>window.events.context=id;graph.onBrush=ids=>window.events.group=ids;graph.update(nodes,edges,'a','',true);graph.setPins([{id:'a',x:-100,y:0},{id:'b',x:100,y:0}]);graph.setCamera({x:0,y:0,scale:1});window.graph=graph;`,
  },
  bundle: true,
  write: false,
  format: "iife",
}).outputFiles[0].text;
const css = ["tokens.css", "style.css"]
  .map((name) => readFileSync(`../src/wikigraph/static/${name}`, "utf8"))
  .join("\n");
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("http://interaction.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<style>${css}</style><div id="graph-view"><canvas id="graph"></canvas></div><script>${bundle}</script>`,
    }),
  );
  await page.goto("http://interaction.test/");
  await page.waitForFunction(
    () => Number(document.querySelector("canvas")?.dataset.frames) > 0,
  );
  await page.evaluate(() => {
    (window as any).graph.setCamera({ x: 0, y: 0, scale: 1 });
  });
  await page.waitForTimeout(50);
});
test("node selection, separate curved evidence targets, drag pin and release", async ({
  page,
}) => {
  await page.mouse.click(620, 450);
  expect(await page.evaluate(() => (window as any).events.selected)).toBe("a");
  await page.mouse.click(720, 444);
  expect(await page.evaluate(() => (window as any).events.edge)).toBe("fact");
  await page.mouse.move(620, 450);
  await page.mouse.down();
  await page.mouse.move(650, 490, { steps: 4 });
  await page.mouse.up();
  expect(
    await page.evaluate(() =>
      (window as any).graph.getPins().find((p: any) => p.id === "a"),
    ),
  ).toMatchObject({ x: -70, y: 40 });
  await page.mouse.dblclick(650, 490);
  expect(
    await page.evaluate(() =>
      (window as any).graph.getPins().some((p: any) => p.id === "a"),
    ),
  ).toBe(false);
});
test("cursor zoom preserves its world point and shift-drag selects a group", async ({
  page,
}) => {
  const world = () =>
    page.evaluate(() => {
      const c = (window as any).graph.camera;
      return { x: (620 - 720) / c.scale + c.x, y: c.y };
    });
  const before = await world();
  await page.mouse.move(620, 450);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(100);
  const after = await world();
  expect(after.x).toBeCloseTo(before.x, 8);
  expect(after.y).toBeCloseTo(before.y, 8);
  await page.keyboard.down("Shift");
  await page.mouse.move(450, 300);
  await page.mouse.down();
  await page.mouse.move(1000, 650, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  expect(
    await page.evaluate(() => (window as any).events.group.sort()),
  ).toEqual(["a", "b"]);
});
test("touch long-press opens actions and pinch changes zoom", async ({
  page,
}) => {
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 620, y: 450, id: 1 }],
  });
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => (window as any).events.context)).toBe("a");
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const before = await page.evaluate(() => (window as any).graph.camera.scale);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: 600, y: 600, id: 1 },
      { x: 800, y: 600, id: 2 },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: 550, y: 600, id: 1 },
      { x: 850, y: 600, id: 2 },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(
    await page.evaluate(() => (window as any).graph.camera.scale),
  ).toBeGreaterThan(before);
});

test("returning from a path restores positions and stops animating", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const before = await page.evaluate(() => {
    const g = (window as any).graph;
    const before = [...g.positions];
    g.update(g.nodes, g.edges, "a", "", true, true);
    g.update(g.nodes, g.edges, "a", "", true, false);
    return before;
  });
  await page.waitForTimeout(350);
  expect(
    await page.evaluate(() => [...(window as any).graph.positions]),
  ).toEqual(before);
  const frames = await page.locator("#graph").getAttribute("data-frames");
  await page.waitForTimeout(150);
  expect(await page.locator("#graph").getAttribute("data-frames")).toBe(frames);
});
test("changing theme repaints cached node colors while preserving pins and camera", async ({
  page,
}) => {
  const snapshot = () =>
    page.evaluate(() => ({
      pins: (window as any).graph.getPins(),
      camera: { ...(window as any).graph.camera },
      pixel: Array.from(
        document
          .querySelector("canvas")!
          .getContext("2d")!
          .getImageData(620, 450, 1, 1).data,
      ),
    }));
  const before = await snapshot();
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    (window as any).graph.refreshTheme();
  });
  await expect
    .poll(async () => (await snapshot()).pixel)
    .not.toEqual(before.pixel);
  const after = await snapshot();
  expect(after.pins).toEqual(before.pins);
  expect(after.camera).toEqual(before.camera);
});
