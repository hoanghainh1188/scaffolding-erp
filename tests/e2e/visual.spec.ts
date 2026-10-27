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
/** The D3 sample order: the first order of a fresh database (D13). */
const SAMPLE_ORDER = `PO-${new Date().getFullYear()}-001`;
/** The receiving sample (goods-receipt D14): after the five D13 orders. */
const RECEIVING_ORDER = `PO-${new Date().getFullYear()}-006`;
const PAGES = [
  { path: "/dashboard", name: "dashboard", ready: DESKTOP_READY },
  { path: "/m", name: "mobile-home", ready: MOBILE_READY },
  { path: "/dev/components", name: "components", ready: "main" },
  {
    path: "/catalog/items?item=GG-K17",
    name: "d9-items",
    ready: DESKTOP_READY,
  },
  // D16: one sample customer, and the tab counts masked, so customers,
  // suppliers or sites other tests add never change the image.
  {
    path: "/catalog/partners?tab=customers&q=minh+phat",
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
  // D2, D3b: the sample orders of the seed; dates of today and the
  // history are masked ([data-mask]). D2 shows one sample supplier only, so
  // the orders purchasing.spec.ts creates never appear.
  { path: "/purchasing?q=chu+ba", name: "d2-orders", ready: DESKTOP_READY },
  {
    path: "/purchasing/orders/new",
    name: "d3-order-form",
    ready: DESKTOP_READY,
  },
  {
    path: `/purchasing/orders/${SAMPLE_ORDER}`,
    name: "d3b-order",
    ready: DESKTOP_READY,
  },
  // goods-receipt design D14: the sample order receiving in two trips is
  // the sixth order of a fresh database. Dates, clock and lists other
  // tests feed (arrivals, receipts by day) are masked.
  {
    path: `/purchasing/orders/${RECEIVING_ORDER}`,
    name: "d3b-receiving",
    ready: DESKTOP_READY,
  },
  {
    path: "/settings/scrap-price",
    name: "scrap-price",
    ready: DESKTOP_READY,
  },
  { path: "/m/scan", name: "m2-scan", ready: MOBILE_READY },
  {
    path: `/m/receive/${RECEIVING_ORDER}`,
    name: "m3-receive",
    ready: MOBILE_READY,
  },
  // M7 before any receipt: the list other tests feed is not in the image.
  {
    path: "/m/history?before=2000-01-01",
    name: "m7-history",
    ready: MOBILE_READY,
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
        // Next's dev issue badge comes and goes with unrelated dev warnings.
        await page.addStyleTag({
          content: "nextjs-portal { display: none !important; }",
        });
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`${name}-${width}.png`, {
          fullPage: true,
          mask: [
            page.locator("[data-clock]"),
            page.locator("[data-mask]"),
            page.getByRole("row").filter({ hasText: "E2E-KHO" }),
          ],
          animations: "disabled",
          caret: "hide",
        });
      });
    }
  }
});
