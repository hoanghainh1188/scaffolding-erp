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
    for (const path of ["/dashboard", "/dev/components"]) {
      await page.goto(path);
      if (path === "/dashboard") await waitForHydration(page, DESKTOP_READY);
      await page.evaluate(() => document.fonts.ready);
      expect(await seriousViolations(page), path).toEqual([]);
    }
  });

  test("mobile pages have no serious or critical issues", async ({
    page,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "mobile-375"), "phone pages");
    for (const path of ["/m", "/dev/components"]) {
      await page.goto(path);
      if (path === "/m") await waitForHydration(page, MOBILE_READY);
      expect(await seriousViolations(page), path).toEqual([]);
    }
  });
});
