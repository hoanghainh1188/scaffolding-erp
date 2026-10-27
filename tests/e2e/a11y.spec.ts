import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  DESKTOP_READY,
  MOBILE_READY,
  runOnlyIn,
  waitForHydration,
} from "./helpers";

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target.join(" ")),
    }));
}

test.describe("accessibility", () => {
  test("desktop pages have no serious or critical issues", async ({
    page,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop pages");
    for (const path of [
      "/dashboard",
      "/settings/users",
      "/catalog/items?item=GG-K17",
      "/catalog/kits",
      "/catalog/partners?tab=customers",
      "/inventory",
      "/inventory/items/GG-K17?from=2026-10-01&to=2026-10-31",
      "/inventory/adjustments",
      "/change-password",
      "/dev/components",
    ]) {
      await page.goto(path);
      if (path !== "/change-password" && path !== "/dev/components") {
        await waitForHydration(page, DESKTOP_READY);
      }
      await page.evaluate(() => document.fonts.ready);
      expect(await seriousViolations(page), path).toEqual([]);
    }
  });

  test("mobile pages have no serious or critical issues", async ({
    page,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "mobile-375"), "phone pages");
    for (const path of ["/m", "/m/profile", "/dev/components"]) {
      await page.goto(path);
      if (path === "/m") await waitForHydration(page, MOBILE_READY);
      expect(await seriousViolations(page), path).toEqual([]);
    }
  });
});

test.describe("accessibility signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the sign-in page has no serious or critical issues", async ({
    page,
  }, testInfo) => {
    test.skip(
      !runOnlyIn(testInfo, "desktop-1280", "mobile-375"),
      "one desktop and one phone width",
    );
    await page.goto("/login");
    await page.evaluate(() => document.fonts.ready);
    expect(await seriousViolations(page)).toEqual([]);
  });
});
