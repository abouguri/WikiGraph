import { test, expect } from "@playwright/test";
for (const theme of ["dark", "light"] as const)
  for (const width of [1440, 390, 320])
    test(`${theme} theme and surfaces at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/#d=teaching&o=fixture-1");
      await expect(page.locator("#status")).toContainText("Map ready");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const themeButton = page.getByRole("button", {
        name: `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
      });
      await expect(themeButton).toBeInViewport();
      await expect(page.locator(".brand-mark")).toBeVisible();
      const query = page.getByLabel("Search entities");
      const queryBefore = await query.boundingBox();
      await query.fill("Python");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await expect(page.locator("#results button").first()).toBeVisible();
      const queryAfter = await query.boundingBox();
      expect(queryAfter!.y).toBe(queryBefore!.y);
      expect((await page.locator("#results").boundingBox())!.y).toBeGreaterThan(
        queryAfter!.y + queryAfter!.height,
      );
      await page.keyboard.press("Escape");
      const before = await page.locator("#graph").getAttribute("data-frames");
      const hash = new URL(page.url()).hash;
      await themeButton.click();
      await expect(page.locator("#graph")).not.toHaveAttribute(
        "data-frames",
        before!,
      );
      expect(new URL(page.url()).hash).toBe(hash);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme",
        theme === "dark" ? "light" : "dark",
      );
      await page.locator("#theme-toggle").click();
      await expect(page.locator("#status")).toContainText("Map ready");
      if (width < 900)
        await page.getByRole("button", { name: "Toggle map list" }).click();
      await page.locator("#entity-list .entity-row").first().click();
      await expect(page.locator("#evidence")).toHaveAttribute(
        "data-view",
        "entity",
      );
      await page.getByRole("button", { name: "Why is this related?" }).click();
      await expect(page.locator("#why")).toContainText(
        "similarity to this origin",
      );
      await page
        .getByRole("button", { name: "Save entity", exact: true })
        .click();
      await page.getByRole("button", { name: "Close evidence" }).click();
      await page.locator('[data-tab="saved"]').click();
      await expect(page.locator("#entity-list .entity-row")).toHaveCount(1);
      await page.locator('[data-tab="connections"]').click();
      await page
        .getByRole("button", { name: "Inspect evidence", exact: true })
        .first()
        .click();
      await expect(page.locator("#evidence")).toHaveAttribute(
        "data-view",
        "evidence",
      );
      await page.getByText("Extraction details", { exact: true }).click();
      await expect(page.locator(".evidence-details dl")).toBeVisible();
      await page.screenshot({
        path: `test-results/themes/${theme}-${width}-evidence.png`,
      });
      expect(errors).toEqual([]);
    });
test("system theme follows changes and works when storage is denied", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("Storage disabled");
      },
    });
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/?mode=offline");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
test("theme text and evidence colors meet normal-text contrast on both surfaces", async ({
  page,
}) => {
  await page.goto("/?mode=offline");
  for (const theme of ["dark", "light"]) {
    const ratios = await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
      const css = getComputedStyle(document.documentElement);
      const luminance = (token: string) => {
        const hex = css.getPropertyValue(token).trim().slice(1);
        const rgb = [0, 2, 4]
          .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
          .map((v) =>
            v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
          );
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      return ["--canvas", "--panel-solid"].flatMap((bg) =>
        ["--text", "--muted", "--accent", "--fact"].map((fg) => {
          const a = luminance(bg),
            b = luminance(fg);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        }),
      );
    }, theme);
    for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
});
