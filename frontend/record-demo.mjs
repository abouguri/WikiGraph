// Capture actual browser states and export a captioned screenshot walkthrough.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "docs/media");
await mkdir(output, { recursive: true });
const frames = await mkdtemp(path.join(tmpdir(), "wikigraph-demo-"));
const server = spawn(
  path.join(root, ".venv/bin/uvicorn"),
  [
    "wikigraph.api:create_app",
    "--factory",
    "--port",
    "8877",
    "--log-level",
    "warning",
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      WIKIGRAPH_GRAPH: path.join(root, "data/wikipedia/graph.ttl"),
    },
    stdio: "ignore",
  },
);
const base = "http://127.0.0.1:8877";
let browser, context;
const started = Date.now(),
  chapters = [];
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(base + "/health");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Demo server did not become ready");
  browser = await chromium.launch();
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-write"],
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let duration = 0;
  const clips = [];
  async function caption(text, seconds) {
    chapters.push({ seconds: duration, text });
    duration += seconds;
    await page.evaluate((text) => {
      let el = document.getElementById("demo-caption");
      if (!el) {
        el = document.createElement("div");
        el.id = "demo-caption";
        document.body.append(el);
      }
      Object.assign(el.style, {
        position: "fixed",
        left: "20px",
        right: "20px",
        bottom: "15px",
        zIndex: "9999",
        background: "#133f34",
        color: "#fff",
        padding: "18px 25px",
        borderRadius: "10px",
        font: "16px/1.5 system-ui",
        boxShadow: "0 3px 20px #0003",
      });
      el.textContent = text;
    }, text);
    console.log(text);
    const frame = path.join(frames, `${chapters.length}.png`);
    await page.screenshot({ path: frame });
    clips.push(`file '${frame}'\nduration ${seconds}`);
  }
  await page.goto(base + "/?mode=api");
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("connections"),
  );
  await page.locator(".workspace").scrollIntoViewIfNeeded();
  await caption(
    "WikiGraph: explore a real 300-page Wikipedia corpus. Each connection retains its source revision.",
    14,
  );
  await page
    .locator("#connections button")
    .filter({ hasText: "Inspect evidence" })
    .first()
    .click();
  await page.locator("#evidence blockquote").waitFor();
  await caption(
    "A page link records a reference. It is deliberately separate from a factual relationship.",
    14,
  );
  await page.locator("#query").fill("Java");
  await page.locator("#search-form").evaluate((form) => form.requestSubmit());
  await page
    .locator("#results")
    .getByRole("button", { name: "Java (programming language)", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector("#selection")?.textContent ===
      "Java (programming language)",
  );
  await page.waitForFunction(
    () =>
      !document.querySelector("#status")?.textContent?.startsWith("Loading"),
  );
  await page.locator("#predicate").selectOption("designedBy");
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.startsWith("1 connections"),
  );
  await page
    .locator("#connections button")
    .filter({ hasText: "Inspect evidence" })
    .first()
    .click();
  await page.waitForFunction(() =>
    document.querySelector("#evidence")?.textContent?.includes("James Gosling"),
  );
  await page.evaluate(() => {
    document.getElementById("demo-caption")?.remove();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: path.join(output, "real-evidence.png"),
    fullPage: true,
  });
  await page.locator(".workspace").scrollIntoViewIfNeeded();
  await caption(
    "Java → designed by → James Gosling. The panel shows the actual sentence, source revision, and extraction method.",
    18,
  );
  await caption(
    "Factual evidence uses exact offsets into a stored snapshot. Open source revision links back to Wikipedia.",
    14,
  );
  await page.locator("#predicate").selectOption("all");
  await page.locator("#direction").selectOption("out");
  await page.locator("#target").selectOption("enwiki-51792");
  await page.locator("#find-path").click();
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("Shortest path"),
  );
  await caption(
    "Choose a destination and direction. Path search has explicit hop, node, and time limits.",
    16,
  );
  await page.locator("#share").click();
  const shared = page.url();
  await page.goto(shared);
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("connections"),
  );
  await page.locator(".workspace").scrollIntoViewIfNeeded();
  await caption(
    "Selections, relationship filters, direction, and destination survive in a shareable URL.",
    14,
  );
  await page.locator("#mode").selectOption("offline");
  await page.waitForFunction(() =>
    document.querySelector("#dataset-note")?.textContent?.includes("Authored"),
  );
  await page.waitForFunction(
    () =>
      !document.querySelector("#status")?.textContent?.startsWith("Loading"),
  );
  await page.locator("#predicate").selectOption("designedBy");
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.startsWith("1 connections"),
  );
  await page
    .locator("#connections button")
    .filter({ hasText: "Inspect evidence" })
    .first()
    .click();
  await caption(
    "Offline teaching examples are synthetic and clearly labeled. They are never presented as Wikipedia evidence.",
    16,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#connections").scrollIntoViewIfNeeded();
  await page.evaluate(() => document.getElementById("demo-caption")?.remove());
  await page.screenshot({
    path: path.join(output, "mobile.png"),
    fullPage: true,
  });
  await caption(
    "The connection list provides keyboard actions. The same exploration works on a narrow screen.",
    16,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".workspace").scrollIntoViewIfNeeded();
  await caption(
    "Verified engineering: byte-identical rebuilds, bounded queries, typed APIs, and measured latency. Real extraction coverage and independent annotation remain open.",
    18,
  );
  if (errors.length) throw new Error(errors.join("\n"));
  await context.close();
  context = undefined;
  const sequence = path.join(frames, "sequence.txt");
  await writeFile(
    sequence,
    clips.join("\n") +
      `\nfile '${path.join(frames, `${chapters.length}.png`)}'\n`,
  );
  await new Promise((resolve, reject) => {
    const encoder = spawn(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        sequence,
        "-vf",
        "scale=1440:1000:force_original_aspect_ratio=decrease,pad=1440:1000:0:0:color=white,fps=5",
        "-t",
        String(duration),
        "-c:v",
        "libvpx-vp9",
        "-crf",
        "35",
        "-b:v",
        "0",
        path.join(output, "demo.webm"),
      ],
      { stdio: "inherit" },
    );
    encoder.on("error", reject);
    encoder.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
    );
  });
  await writeFile(
    path.join(output, "chapters.json"),
    JSON.stringify(
      {
        duration_seconds: duration,
        captions: chapters,
        kind: "Captioned screenshots captured from the running application; no audio",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Demo recorded in ${Math.round((Date.now() - started) / 1000)} seconds`,
  );
} finally {
  if (context) await context.close();
  if (browser) await browser.close();
  server.kill("SIGTERM");
  await rm(frames, { recursive: true, force: true });
}
