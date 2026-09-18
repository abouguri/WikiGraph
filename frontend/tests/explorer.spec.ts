import { test, expect } from "@playwright/test";

test("offline search, evidence, path, and shareable selection", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
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
  await page.screenshot({path: "test-results/explorer.png", fullPage: true});
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
  await page.goto("/");
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
