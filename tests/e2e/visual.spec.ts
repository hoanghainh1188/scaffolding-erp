import { expect, test } from "@playwright/test";

import {
  DESKTOP_READY,
  MOBILE_READY,
  runOnlyIn,
  waitForHydration,
} from "./helpers";

// Baselines are created and compared on CI only (Linux + Edge); local runs
// skip @visual (playwright.config.ts). Update them with the
// "Update Playwright snapshots" workflow, never from a dev machine.
const WIDTHS = [360, 375, 768, 1024, 1280, 1366] as const;
const PAGES = [
  { path: "/dashboard", name: "dashboard", ready: DESKTOP_READY },
  { path: "/m", name: "mobile-home", ready: MOBILE_READY },
  { path: "/dev/components", name: "components", ready: "main" },
  {
    path: "/catalog/items?item=GG-K17",
    name: "d9-items",
    ready: DESKTOP_READY,
  },
  {
    path: "/catalog/partners?tab=customers",
    name: "d16-partners",
    ready: DESKTOP_READY,
  },
  // D10: the clock and the E2E-KHO rows (inventory.spec.ts posts to them)
  // change from run to run, so they are masked.
  { path: "/inventory", name: "d10-stock", ready: DESKTOP_READY },
  {
    path: "/inventory/items/GG-K17?from=2026-10-01&to=2026-10-31",
    name: "d11-stock-card",
    ready: DESKTOP_READY,
  },
] as const;

test.describe("visual baselines @visual", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "sets its own viewport");
  });

  for (const { path, name, ready } of PAGES) {
    for (const width of WIDTHS) {
      test(`${name} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        if (ready !== "main") await waitForHydration(page, ready);
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`${name}-${width}.png`, {
          fullPage: true,
          mask: [
            page.getByText(/^Tính từ sổ kho · cập nhật/),
            page.getByRole("row").filter({ hasText: "E2E-KHO" }),
          ],
          animations: "disabled",
          caret: "hide",
        });
      });
    }
  }
});
