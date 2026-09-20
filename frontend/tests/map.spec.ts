import { test, expect } from "@playwright/test";
import { OfflineIndex } from "../src/offline";
import { readFileSync } from "node:fs";
const sample = JSON.parse(
  readFileSync(
    new URL("../../src/wikigraph/static/sample.json", import.meta.url),
    "utf8",
  ),
);
test("offline similarity matches API maps for one and multiple origins", async ({
  request,
}) => {
  const index = new OfflineIndex(sample);
  for (const origins of [
    ["fixture-1"],
    ["fixture-1", "fixture-3"],
    ["fixture-1", "fixture-3", "fixture-5"],
  ]) {
    const expected = await (
      await request.get(
        "/graph/map?" +
          new URLSearchParams({ origins: origins.join(","), limit: "10" }),
      )
    ).json();
    const actual = index.map(origins, 10);
    expect(actual.nodes.map((n) => n.id)).toEqual(
      expected.nodes.map((n: any) => n.id),
    );
    for (const n of actual.nodes) {
      const e = expected.nodes.find((e: any) => e.id === n.id);
      expect(n.similarity).toBeCloseTo(e.similarity, 12);
      expect(n.cluster).toBe(e.cluster);
    }
    expect(actual.lists).toEqual(expected.lists);
    const sort = (a: any, b: any) =>
      a.source.localeCompare(b.source) || a.target.localeCompare(b.target);
    const links = actual.layout_links.sort(sort),
      expectedLinks = expected.layout_links.sort(sort);
    expect(links.length).toBe(expectedLinks.length);
    links.forEach((l, i) => {
      expect(l.source).toBe(expectedLinks[i].source);
      expect(l.target).toBe(expectedLinks[i].target);
      expect(l.weight).toBeCloseTo(expectedLinks[i].weight, 12);
    });
  }
});
for (const mode of ["offline", "api"])
  test(`${mode}: origins, explanations, expansion and share restore`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?mode=" + mode);
    await expect(page.locator("#suggestions button")).toHaveCount(6);
    await page.getByLabel("Search entities").fill("Python");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.locator("#results button").first().click();
    await expect(page.locator("#status")).toContainText("Map ready");
    await expect(page.locator("#graph")).toHaveAttribute("data-nodes", /\d+/);
    await page.locator("[data-tab=map]").click();
    await page.locator("#entity-list .entity-row").first().click();
    await page.getByRole("button", { name: "Why is this related?" }).click();
    await expect(page.locator("#why")).toContainText(
      "similarity to this origin",
    );
    await page.getByRole("button", { name: "Expand 12 connections" }).click();
    await expect(page.locator("#status")).toContainText("Expanded");
    const count = await page.locator("#counts").textContent();
    await page.reload();
    await expect(page.locator("#counts")).toHaveText(count!);
    await page.locator("[data-tab=connections]").click();
    await page
      .getByRole("button", { name: "Inspect evidence", exact: true })
      .first()
      .click();
    await expect(page.locator("#evidence blockquote")).toBeVisible();
  });
