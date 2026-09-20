// Reproducible captures of the actual UI; no fabricated graph data.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  output = path.join(root, "docs/media");
await mkdir(output, { recursive: true });
const frames = await mkdtemp(path.join(tmpdir(), "wikigraph-cosmos-"));
const server = spawn(
  path.join(root, ".venv/bin/uvicorn"),
  [
    "wikigraph.api:create_app",
    "--factory",
    "--port",
    "8879",
    "--log-level",
    "warning",
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      WIKIGRAPH_GRAPH: path.join(root, "data/wikipedia/graph.ttl"),
      WIKIGRAPH_RATE_LIMIT: "10000",
    },
    stdio: "ignore",
  },
);
const base = "http://127.0.0.1:8879";
let browser;
const chapters = [],
  checks = [];
let duration = 0;
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + "/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw Error("Local demo server did not start");
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const capture = async (name, caption, seconds = 10) => {
    await page.screenshot({ path: path.join(output, name + ".png") });
    await page.evaluate((text) => {
      let caption = document.getElementById("recording-caption");
      if (!caption) {
        caption = document.createElement("div");
        caption.id = "recording-caption";
        document.body.append(caption);
      }
      caption.textContent = text;
      Object.assign(caption.style, {
        position: "fixed",
        bottom: "12px",
        left: "12px",
        right: "12px",
        zIndex: "100",
        padding: "14px 22px",
        background: "#131a2e",
        color: "#e4e9f7",
        border: "1px solid #62718f",
        borderRadius: "10px",
        font: "15px system-ui",
      });
    }, caption);
    const filename = path.join(frames, String(chapters.length) + ".png");
    await page.screenshot({ path: filename });
    chapters.push({
      seconds: duration,
      caption,
      file: filename,
      duration: seconds,
    });
    duration += seconds;
    await page.evaluate(() =>
      document.getElementById("recording-caption")?.remove(),
    );
  };
  await page.goto(base);
  await page.locator("#suggestions button").first().waitFor();
  await capture(
    "cosmos-landing",
    "Start with one to three origins. This is the real 300-page Wikipedia corpus.",
  );
  const search = async (text) => {
    await page.getByLabel("Search entities").fill(text);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.locator("#results button").first().click();
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("Map ready"),
    );
  };
  await search("Python (programming language)");
  await capture(
    "dense-graph",
    "Nearby entities share structural connections. Dashed lines remain page references.",
  );
  await page.locator("#entity-list .entity-row").nth(1).click();
  await page.getByRole("button", { name: "Why is this related?" }).click();
  await page.waitForFunction(() =>
    document
      .querySelector("#why")
      .textContent.includes("similarity to this origin"),
  );
  await capture(
    "cosmos-explanation",
    "Inspect weighted shared neighbors. Similarity is not a factual confidence score.",
  );
  await page.getByRole("button", { name: "Close evidence" }).click();
  await search("Java (programming language)");
  await page.getByText("Appearance & filters", { exact: true }).click();
  await page
    .getByLabel("Relationship", { exact: true })
    .selectOption("designedBy");
  await page.locator("[data-tab=connections]").click();
  await page
    .getByRole("button", { name: "Inspect evidence", exact: true })
    .first()
    .click();
  await page.locator("#evidence blockquote").waitFor();
  checks.push({
    evidence: await page.locator("#evidence h2").textContent(),
    source: await page.locator("#evidence a").getAttribute("href"),
  });
  await capture(
    "real-evidence",
    "Gold connections have extractable source evidence. Open the pinned Wikipedia revision.",
  );
  await page.getByRole("button", { name: "Close evidence" }).click();
  await page.getByRole("combobox", { name: "Dataset" }).selectOption("offline");
  await page.locator("#suggestions button").first().waitFor();
  await search("Python");
  await page.locator("[data-tab=map]").click();
  await page.getByLabel("Relationship", { exact: true }).selectOption("all");
  await capture(
    "cosmos-teaching",
    "The offline teaching sample uses the same map workflow, with synthetic evidence clearly labeled.",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, "mobile.png") });
  await page.getByRole("button", { name: "Toggle map list" }).click();
  await page.locator("#entity-list .entity-row").first().click();
  await page.screenshot({ path: path.join(output, "mobile-details.png") });
  await page.getByRole("button", { name: "Save entity", exact: true }).click();
  await page.getByRole("button", { name: "Close evidence" }).click();
  await page.locator("[data-tab=saved]").click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await capture(
    "cosmos-saved",
    "Save discoveries from the detail panel, then export your saved list as JSON, CSV or Markdown.",
  );
  if (errors.length) throw Error(errors.join("\n"));
  const concat =
    chapters.map((c) => `file '${c.file}'\nduration ${c.duration}`).join("\n") +
    `\nfile '${chapters.at(-1).file}'\n`;
  const list = path.join(frames, "frames.txt");
  await writeFile(list, concat);
  await new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        list,
        "-vf",
        "fps=12,format=yuv420p",
        "-c:v",
        "libvpx-vp9",
        "-b:v",
        "0",
        "-crf",
        "36",
        path.join(output, "demo.webm"),
      ],
      { stdio: "inherit" },
    );
    ffmpeg.on("error", reject);
    ffmpeg.on("exit", (code) =>
      code ? reject(Error("ffmpeg failed")) : resolve(),
    );
  });
  await writeFile(
    path.join(root, "reports/cosmos-demo.json"),
    JSON.stringify(
      {
        duration_seconds: duration,
        chapters: chapters.map(({ file, ...rest }) => rest),
        checks,
        browser_errors: errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Captured six chapters, desktop and mobile screenshots; " +
      duration +
      " seconds.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await rm(frames, { recursive: true, force: true });
}
