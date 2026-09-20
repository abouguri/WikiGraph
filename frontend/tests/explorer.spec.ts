import { test, expect } from "@playwright/test";
for (const mode of ["offline", "api"])
  test(`${mode}: path, evidence and keyboard search`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?mode=" + mode);
    await expect(page.locator("#suggestions button")).toHaveCount(6);
    await page.getByLabel("Search entities").fill("Python");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator("#results button").first()).toBeVisible();
    await page.getByLabel("Search entities").press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.locator("#status")).toContainText("Map ready");
    await page.getByText("Appearance & filters", { exact: true }).click();
    await page
      .getByLabel("Relationship", { exact: true })
      .selectOption("designedBy");
    await page
      .getByRole("button", { name: "Find a path", exact: true })
      .click();
    await page.getByLabel("Search destinations").fill("Guido");
    await expect(page.locator("#target option")).toHaveCount(2);
    await page
      .getByLabel("Destination", { exact: true })
      .selectOption("fixture-2");
    await page.getByRole("button", { name: "Find shortest path" }).click();
    await expect(page.locator("#status")).toContainText("Shortest path: 1");
    await expect(page.locator(".step-number")).toHaveText("Step 1");
    await page
      .getByRole("button", { name: "Inspect evidence", exact: true })
      .click();
    await expect(page.locator("#evidence")).toContainText(
      "Synthetic teaching example",
    );
    await expect(page.locator("#evidence blockquote")).toContainText("Guido");
    await page.reload();
    await expect(page.locator(".step-number")).toHaveText("Step 1");
    await page.getByRole("button", { name: "Back to map" }).click();
    await expect(page.locator("#status")).toContainText("Returned to your map");
    expect(errors).toEqual([]);
  });
test("retry and late dataset responses do not overwrite a newer selection", async ({
  page,
}) => {
  let release = () => {};
  const wait = new Promise<void>((r) => (release = r));
  await page.route("**/entities?limit=100&offset=0", async (route) => {
    await wait;
    await route.fulfill({
      json: {
        items: [{ id: "late", label: "Late response", aliases: [] }],
        total: 1,
      },
    });
  });
  await page.goto("/?mode=api");
  await page.getByRole("combobox", { name: "Dataset" }).selectOption("offline");
  await expect(page.locator("#suggestions button")).toHaveCount(6);
  release();
  await expect(page.locator("#dataset-note")).toContainText("Teaching sample");
  await page.unroute("**/entities?limit=100&offset=0");
  let failed = true;
  await page.route("**/entities?limit=100&offset=0", (route) => {
    if (failed) {
      failed = false;
      return route.fulfill({ status: 503, json: { error: "Unavailable" } });
    }
    return route.continue();
  });
  await page.getByRole("combobox", { name: "Dataset" }).selectOption("api");
  await expect(page.locator("#status")).toContainText("Couldn't build the map");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator("#suggestions button")).toHaveCount(6);
  await expect(page.locator("#retry")).toBeHidden();
});
test("multi-origin map is capped at three and unknown share IDs are reported", async ({
  page,
}) => {
  await page.goto("/#d=teaching&o=fixture-1,fixture-3,missing");
  await expect(page.locator("#status")).toContainText(
    "Some shared entities are unavailable",
  );
  await expect(page.locator("#origins button")).toHaveCount(2);
  await page.locator("#entity-list .entity-row").nth(2).click();
  await page
    .getByRole("button", { name: "Add as origin", exact: true })
    .click();
  await expect(page.locator("#origins button")).toHaveCount(3);
  await page.locator("#entity-list .entity-row").nth(4).click();
  await expect(
    page.getByRole("button", { name: "Add as origin", exact: true }),
  ).toBeDisabled();
  await page.locator("#origins button").last().click();
  await expect(page.locator("#origins button")).toHaveCount(2);
});
test("empty search, isolated origin and bounded path have clear states", async ({
  page,
}) => {
  await page.route("**/sample.json", async (route) => {
    const data = await (await route.fetch()).json();
    data.entities.push({
      id: "isolated",
      label: "Isolated topic",
      aliases: [],
      type: "Other",
      year: null,
    });
    await route.fulfill({ json: data });
  });
  await page.goto("/#d=teaching&o=isolated");
  await expect(page.locator("#status")).toContainText(
    "No similar entities found",
  );
  await page.getByLabel("Search entities").fill("No matching topic");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator("#results")).toContainText("No entities found");
  await page.getByRole("button", { name: "Find a path", exact: true }).click();
  await page
    .getByLabel("Destination", { exact: true })
    .selectOption("fixture-1");
  await page.getByRole("button", { name: "Find shortest path" }).click();
  await expect(page.locator("#status")).toContainText("No path exists");
});
