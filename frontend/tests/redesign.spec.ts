import { test, expect } from "@playwright/test";
for (const mode of ["offline", "api"])
  for (const width of [1440, 900, 390])
    test(`${mode} responsive map ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/?mode=" + mode);
      await expect(page.locator("#suggestions button")).toHaveCount(6);
      await page.screenshot({
        path: `test-results/cosmos/${mode}-${width}-landing.png`,
      });
      await page.getByLabel("Search entities").fill("Python");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await page.locator("#results button").first().click();
      await expect(page.locator("#status")).toContainText("Map ready");
      await expect(page.locator("#results")).toBeHidden();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/cosmos/${mode}-${width}-map.png`,
      });
      if (width < 900)
        await page.getByRole("button", { name: "Toggle map list" }).click();
      await page.locator("#entity-list .entity-row").first().click();
      if (width < 900) {
        await expect(page.locator("#inspector")).toHaveAttribute(
          "aria-modal",
          "true",
        );
        await expect(page.locator("#inspector")).toBeFocused();
      }
      await page.getByRole("button", { name: "Why is this related?" }).click();
      await expect(page.locator("#why")).toContainText(
        "similarity to this origin",
      );
      await page.screenshot({
        path: `test-results/cosmos/${mode}-${width}-detail.png`,
      });
      await page.getByRole("button", { name: "Close evidence" }).click();
      if (width < 900)
        await expect(
          page.locator("#entity-list .entity-row").first(),
        ).toBeFocused();
      await page.locator("[data-tab=connections]").click();
      await page
        .getByRole("button", { name: "Inspect evidence", exact: true })
        .first()
        .click();
      await expect(page.locator("#evidence blockquote")).toBeVisible();
      await page.screenshot({
        path: `test-results/cosmos/${mode}-${width}-evidence.png`,
      });
      expect(errors).toEqual([]);
    });
test("canvas keyboard can select, expand and fit without pointer input", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#d=teaching&o=fixture-1");
  await expect(page.locator("#status")).toContainText("Map ready");
  await page.locator("#graph").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#status")).toContainText("Selected");
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toContainText("Expanded");
  await page.keyboard.press("f");
  await page.keyboard.press("/");
  await expect(page.getByLabel("Search entities")).toBeFocused();
});
