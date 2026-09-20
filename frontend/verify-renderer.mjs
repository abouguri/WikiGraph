import { build } from "esbuild";
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = `import {GraphView} from './src/renderer';
const nodes=Array.from({length:300},(_,i)=>({id:'n'+i,label:'Topic '+i,type:['Language','Person','Concept','Organization','Work'][i%5],in_links:i%60,cluster:i%5,is_origin:i===0}));
const edges=Array.from({length:900},(_,i)=>({id:'e'+i,subject:'n'+(i%300),object:'n'+((i%300+1+Math.floor(i/300)*17)%300),predicate:i%53===0?'designedBy':'linksTo'}));
const canvas=document.querySelector('canvas');let selected='n0';const graph=new GraphView(canvas,id=>{selected=id;graph.update(nodes,edges,id,'')},id=>{window.lastEdge=id});graph.update(nodes,edges,selected,'',true);window.harness={graph,nodes,edges,canvas};`;
const bundle = await build({
  stdin: {
    contents: entry,
    resolveDir: path.join(root, "frontend"),
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "iife",
  target: "es2022",
});
const css = readFileSync(
  path.join(root, "src/wikigraph/static/style.css"),
  "utf8",
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
});
await page.route("http://renderer.test/", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><style>${css}</style><div id="graph-view"><canvas id="graph" style="width:100vw;height:100vh"></canvas></div><script>${bundle.outputFiles[0].text}</script>`,
  }),
);
await page.goto("http://renderer.test/");
await page.waitForFunction(
  () => Number(document.querySelector("canvas").dataset.frames) > 0,
);
const result = await page.evaluate(async () => {
  const { graph, canvas, nodes, edges } = window.harness;
  const samples = [],
    draws = [];
  let last;
  await new Promise((resolve) => {
    let frames = 0;
    function tick(time) {
      if (last !== undefined) {
        samples.push(time - last);
        draws.push(Number(canvas.dataset.drawMs));
      }
      last = time;
      graph.setCamera({ ...graph.camera, x: graph.camera.x + 0.9 });
      frames++;
      if (frames < 181) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
  await new Promise((r) => setTimeout(r, 100));
  const before = Number(canvas.dataset.frames);
  await new Promise((r) => setTimeout(r, 500));
  const sorted = [...draws].sort((a, b) => a - b);
  return {
    nodes: nodes.length,
    edges: edges.length,
    fps: 1000 / (samples.reduce((a, b) => a + b, 0) / samples.length),
    draw_p95_ms: sorted[Math.floor(sorted.length * 0.95)],
    idle_frames: Number(canvas.dataset.frames) - before,
    method:
      "DPR 1, headless Chromium, requestAnimationFrame camera pan after reduced-motion settling",
    visible_labels: Number(canvas.dataset.visibleLabels),
  };
});
mkdirSync(path.join(root, "reports"), { recursive: true });
writeFileSync(
  path.join(root, "reports/cosmos-renderer.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(result);
if (result.fps < 55 || result.draw_p95_ms > 16.7 || result.idle_frames !== 0)
  throw new Error("Renderer budget failed");
await browser.close();
