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
    // Eleven axe scans can pass 30 s on a busy CI runner.
    test.slow();
    for (const path of [
      "/dashboard",
      "/settings/users",
      "/settings/activity?from=2026-10-27&to=2026-10-28",
      "/catalog/items?item=GG-K17",
      "/catalog/kits",
      "/catalog/partners?tab=customers",
      "/inventory",
      "/inventory/items/GG-K17?from=2026-10-01&to=2026-10-31",
      "/inventory/adjustments",
      "/change-password",
      "/sessions",
      "/dev/components",
    ]) {
      await page.goto(path);
      if (
        path !== "/change-password" &&
        path !== "/sessions" &&
        path !== "/dev/components"
      ) {
        await waitForHydration(page, DESKTOP_READY);
      }
      await page.evaluate(() => document.fonts.ready);
      expect(await seriousViolations(page), path).toEqual([]);
    }
  });

  // simple-repair task 7.3: the list and D12 (new slip and a saved one).
  test("repair pages have no serious or critical issues", async ({
    page,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop pages");
    for (const path of [
      "/repairs",
      "/repairs/new",
      "/production",
      "/production/new",
      "/production/boms",
      `/repairs/PSC-${new Date().getFullYear()}-022`,
    ]) {
      await page.goto(path);
      await waitForHydration(page, DESKTOP_READY);
      await page.evaluate(() => document.fonts.ready);
      expect(await seriousViolations(page), path).toEqual([]);
    }
  });

  // Own test: one loop over every desktop page outruns the 30s timeout on
  // CI, where next dev compiles each page on its first visit.
  test("purchasing pages have no serious or critical issues", async ({
    page,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop pages");
    for (const path of [
      "/purchasing",
      "/purchasing/orders/new",
      `/purchasing/orders/PO-${new Date().getFullYear()}-001`,
    ]) {
      await page.goto(path);
      await waitForHydration(page, DESKTOP_READY);
      await page.evaluate(() => document.fonts.ready);
      expect(await seriousViolations(page), path).toEqual([]);
    }
  });

  test("mobile pages have no serious or critical issues", async ({
    page,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "mobile-375"), "phone pages");
    for (const path of [
      "/m",
      "/m/profile",
      "/sessions?from=m",
      "/dev/components",
    ]) {
      await page.goto(path);
      if (path === "/m") await waitForHydration(page, MOBILE_READY);
      expect(await seriousViolations(page), path).toEqual([]);
    }
  });
});

// goods-receipt task 10.3: M1, M2, M3, M7 (as Giám đốc, who can receive).
test("receiving phone pages have no serious or critical issues", async ({
  page,
}, testInfo) => {
  test.skip(!runOnlyIn(testInfo, "mobile-375"), "phone pages");
  for (const path of ["/m", "/m/scan", "/m/history"]) {
    await page.goto(path);
    await waitForHydration(page, MOBILE_READY);
    expect(await seriousViolations(page), path).toEqual([]);
  }
  await page.goto("/m");
  await waitForHydration(page, MOBILE_READY);
  await page
    .getByRole("link", { name: /Bắt đầu nhập hàng|Tiếp tục nhập/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByText(/Chuyến \d+ · /)).toBeVisible();
  expect(await seriousViolations(page), page.url()).toEqual([]);
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
