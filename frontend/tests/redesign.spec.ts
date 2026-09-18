import { test, expect, type Page } from "@playwright/test";

async function denseFixture(page: Page, count = 54) {
  const entities = Array.from({ length: 40 }, (_, i) => ({
    id: `dense-${i}`,
    label:
      i === 0 ? "Software development" : `Topic ${i} with a descriptive name`,
    aliases: [],
  }));
  const edges = Array.from({ length: 39 }, (_, i) => ({
    id: `edge-${i}`,
    subject: "dense-0",
    object: `dense-${i + 1}`,
    predicate: "linksTo",
  }));
  for (let i = 39; i < count; i++)
    edges.push({
      id: `edge-${i}`,
      subject: `dense-${1 + Math.floor((i - 39) / 38)}`,
      object: `dense-${2 + ((i - 39) % 38)}`,
      predicate: "linksTo",
    });
  await page.route("**/entities?**", (route) =>
    route.fulfill({ json: { items: entities, total: 40 } }),
  );
  await page.route("**/entities/dense-*/neighbors?**", (route) => {
    const url = new URL(route.request().url()),
      id = url.pathname.split("/")[2];
    const all = edges.filter((e) => e.subject === id || e.object === id),
      offset = Number(url.searchParams.get("offset") || 0),
      limit = Number(url.searchParams.get("limit") || 12);
    const slice = all.slice(offset, offset + limit),
      ids = new Set([id, ...slice.flatMap((e) => [e.subject, e.object])]);
    return route.fulfill({
      json: {
        nodes: entities.filter((n) => ids.has(n.id)),
        edges: slice,
        total: all.length,
        truncated: offset + limit < all.length,
      },
    });
  });
  await page.goto("/?mode=api&entity=dense-0");
  await expect(page.locator("#counts")).toHaveText("13 entities · 12 edges");
}

async function labelsDoNotOverlap(page: Page) {
  const rects = await page
    .locator("#graph [data-label]")
    .evaluateAll((elements) =>
      elements.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
  expect(rects.length).toBeGreaterThan(3);
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i],
        b = rects[j];
      expect(
        a.x < b.x + b.w &&
          a.x + a.w > b.x &&
          a.y < b.y + b.h &&
          a.y + a.h > b.y,
      ).toBe(false);
    }
}

test("dense graph: progressive loading, stable positions, readable labels and explicit selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await denseFixture(page);
  const position = () =>
    page
      .locator('[data-node="dense-1"] circle')
      .last()
      .evaluate((el) => [el.getAttribute("cx"), el.getAttribute("cy")]);
  const before = await position();
  for (const expected of [24, 36, 39]) {
    await page
      .getByRole("button", { name: "Show more connections", exact: true })
      .click();
    await expect(page.locator("#counts")).toContainText(`${expected} edges`);
  }
  expect(await position()).toEqual(before);
  await page.locator('[data-node="dense-1"]').click();
  await expect(page.locator("#counts")).toHaveText("40 entities · 39 edges");
  await page
    .getByRole("button", { name: "Expand connections", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show more connections", exact: true })
    .click();
  await expect(page.locator("#counts")).toHaveText("40 entities · 54 edges");
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await labelsDoNotOverlap(page);
  await expect(page.locator('#graph [data-label="dense-1"]')).toHaveCount(1);
  expect(
    Number(await page.locator("#graph").getAttribute("data-layout-ms")),
  ).toBeLessThan(300);
  await page.screenshot({
    path: "test-results/redesign-dense.png",
    fullPage: true,
  });
  const old = await position();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  expect(await position()).not.toEqual(old);
});

test("workspace has no horizontal overflow and preserves mobile evidence access", async ({
  page,
}) => {
  await page.goto("/?mode=offline");
  await expect(page.locator("#status")).toContainText("connections around");
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("tab", { name: "Connections", exact: true }).click();
  await page
    .getByRole("button", { name: "Inspect evidence", exact: true })
    .first()
    .click();
  await expect(page.locator("#inspector")).toBeVisible();
  await page.getByRole("button", { name: "Close evidence" }).click();
  await expect(page.locator("#inspector")).not.toBeVisible();
});

test("mobile evidence sheet restores focus and destination search uses exact matches", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?mode=offline");
  await expect(page.locator("#status")).toContainText("connections around");
  await expect(
    page.getByRole("tab", { name: "Connections", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Inspect evidence", exact: true })
    .first()
    .click();
  await expect(page.locator("#inspector")).toHaveAttribute(
    "aria-modal",
    "true",
  );
  await expect(page.locator("#inspector")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#inspector")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Inspect evidence", exact: true }).first(),
  ).toBeFocused();
  await page.getByRole("button", { name: "Find a path", exact: true }).click();
  await page.getByLabel("Search destinations").fill("Guido");
  await expect(page.locator("#target option")).toHaveCount(2);
  await page
    .getByLabel("Destination", { exact: true })
    .selectOption("fixture-2");
  await page.getByRole("button", { name: "Find shortest path" }).click();
  await expect(page.locator("#status")).toContainText("Shortest path");
  await expect(page.locator(".step-number").first()).toHaveText("Step 1");
  await page.getByRole("button", { name: "Back to neighborhood" }).click();
  await expect(page.locator("#status")).toContainText(
    "Returned to your neighborhood",
  );
});

test("search keyboard navigation and retry recover from a failed refresh", async ({
  page,
}) => {
  await page.goto("/?mode=offline");
  await expect(page.locator("#status")).toContainText("connections around");
  await page.getByLabel("Search entities").fill("Java");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator("#results button").first()).toHaveText(
    "Java (programming language)",
  );
  await page.getByLabel("Search entities").press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("#selection")).toHaveText(
    "Java (programming language)",
  );
  let failed = true;
  await page.route("**/entities?limit=100&offset=0", async (route) => {
    if (failed) {
      failed = false;
      await route.fulfill({ status: 503, json: { error: "Unavailable" } });
    } else await route.continue();
  });
  await page.getByLabel("Dataset").selectOption("api");
  await expect(page.locator("#status")).toContainText("Unable to load");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator("#status")).toContainText("connections around");
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).not.toBeVisible();
});
