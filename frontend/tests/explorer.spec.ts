import { test, expect } from "@playwright/test";

test("offline search, evidence, path, and shareable selection", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?mode=offline");
  await expect(page.locator("#status")).toContainText("connections around");
  await page.getByLabel("Search entities").fill("Python");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .locator("#results")
    .getByRole("button", { name: "Python (programming language)", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Relationship", exact: true })
    .selectOption("designedBy");
  await expect(page.locator("#connections li")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Inspect evidence", exact: true })
    .click();
  await expect(page.locator("#evidence")).toContainText(
    "Synthetic teaching example",
  );
  await expect(page.locator("#evidence")).toContainText("Guido van Rossum");
  await page.screenshot({ path: "test-results/explorer.png", fullPage: true });
  await page.getByLabel("Destination").selectOption("fixture-2");
  await page.getByRole("button", { name: "Find shortest path" }).click();
  await expect(page.locator("#status")).toContainText("Shortest path: 1");
  const url = page.url();
  await page.goto(url);
  await expect(page.locator("#predicate")).toHaveValue("designedBy");
  await expect(page.locator("#selection")).toHaveText(
    "Python (programming language)",
  );
  expect(errors).toEqual([]);
});

test("server mode, keyboard selection and mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?mode=api");
  await expect(page.locator("#status")).toContainText("connections around");
  const search = page.getByLabel("Search entities");
  await search.fill("Guido");
  await search.press("Enter");
  const result = page.locator("#results button").first();
  await expect(result).toContainText("Guido");
  await result.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#selection")).toHaveText("Guido van Rossum");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("empty search and no path are explained", async ({ page }) => {
  await page.goto("/?mode=offline");
  await expect(page.locator("#status")).toContainText("connections around");
  await page.getByLabel("Search entities").fill("No matching entity");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator("#results")).toContainText("No entities found");
  await page
    .getByRole("combobox", { name: "Relationship", exact: true })
    .selectOption("designedBy");
  await page.getByLabel("Destination").selectOption("fixture-9");
  await page.getByRole("button", { name: "Find shortest path" }).click();
  await expect(page.locator("#status")).toContainText("No path");
});

test("hosted landing view selects the server dataset by default", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("connections around");
  await expect(page.locator("#mode")).toHaveValue("api");
  await expect(page.locator("#dataset-note")).toContainText("Server dataset");
});

test("all entity pages are available for shared selection and paths", async ({
  page,
}) => {
  const entities = Array.from({ length: 250 }, (_, i) => ({
    id: `fixture-${i + 1}`,
    label: `Topic ${i + 1}`,
    aliases: [],
  }));
  entities[200].label = "Python (programming language)";
  await page.route("**/entities?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const offset = Number(params.get("offset") || 0);
    const limit = Number(params.get("limit") || 20);
    return route.fulfill({
      json: {
        items: entities.slice(offset, offset + limit),
        total: entities.length,
      },
    });
  });
  await page.route("**/entities/fixture-201/neighbors?**", (route) =>
    route.fulfill({
      json: { nodes: [entities[200]], edges: [], total: 0, truncated: false },
    }),
  );
  await page.goto("/?mode=api&entity=fixture-201&target=fixture-250");
  await expect(page.locator("#selection")).toHaveText(
    "Python (programming language)",
  );
  await expect(page.locator("#target option")).toHaveCount(251);
  await expect(page.locator("#target")).toHaveValue("fixture-250");
});

test("late server load cannot overwrite the chosen offline dataset", async ({
  page,
}) => {
  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/entities?limit=100&offset=0", async (route) => {
    await blocked;
    await route.fulfill({
      json: {
        items: [{ id: "late", label: "Late response", aliases: [] }],
        total: 1,
      },
    });
  });
  await page.goto("/?mode=api");
  await page.getByLabel("Dataset").selectOption("offline");
  await expect(page.locator("#selection")).toHaveText(
    "Python (programming language)",
  );
  release();
  await expect(page.locator("#dataset-note")).toContainText("Authored sample");
  await expect(page.locator("#mode")).toHaveValue("offline");
});
