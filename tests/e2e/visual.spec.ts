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
/** The D12 sample draft (simple-repair design D13): after PSC-…-021. */
const SAMPLE_REPAIR = `PSC-${new Date().getFullYear()}-022`;
/** The D13 sample session (stocktake design D16): the first KK of a year. */
const SAMPLE_STOCKTAKE = `KK-${new Date().getFullYear()}-001`;
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
  // D18: the seed sample of 27–28/10/2026 (activity-log design D13); rows
  // other tests log carry the day they run, outside this range.
  {
    path: "/settings/activity?from=2026-10-27&to=2026-10-28",
    name: "d18-activity",
    ready: DESKTOP_READY,
  },
  // simple-repair: drafts only (repairs.spec.ts posts its own slips), and
  // the D12 sample draft. Its date is today, so it is masked; E2E-KHO
  // waiting rows come and go with other tests, so they are removed.
  { path: "/repairs?status=draft", name: "repairs", ready: DESKTOP_READY },
  {
    path: `/repairs/${SAMPLE_REPAIR}`,
    name: "d12-repair",
    ready: DESKTOP_READY,
  },
  // stocktake: the seed session waiting at BAI-01; sessions stocktake.spec.ts
  // opens at XUONG-01 come and go, so their rows are removed.
  {
    path: "/inventory/stocktakes?status=submitted",
    name: "d13-stocktakes",
    ready: DESKTOP_READY,
  },
  {
    path: `/inventory/stocktakes/${SAMPLE_STOCKTAKE}?filter=diff`,
    name: "d13-stocktake",
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
        // D12 lists Chờ sửa at the yard, where receiving.spec.ts adds
        // E2E-KHO rows: drop them so the page height never depends on it.
        await page
          .getByRole("listitem")
          .filter({ hasText: "E2E-KHO" })
          .evaluateAll((rows) => rows.forEach((row) => row.remove()));
        // Stocktake sessions stocktake.spec.ts runs at the workshop (list
        // rows, M1 cards) are not part of any baseline.
        if (name.startsWith("d13") || name === "mobile-home") {
          await page
            .locator("tr, article")
            .filter({ hasText: "XUONG-01" })
            .evaluateAll((rows) => rows.forEach((row) => row.remove()));
        }
        // Masked dates and clocks still set their column widths: "29/10"
        // and "30/10" differ by a fraction of a pixel, which shifts the
        // text after them. Zero their digits so the layout is the same
        // every day.
        await page.locator("[data-mask], [data-clock]").evaluateAll((nodes) =>
          nodes.forEach((node) => {
            const walker = document.createTreeWalker(
              node,
              NodeFilter.SHOW_TEXT,
            );
            for (let text = walker.nextNode(); text; text = walker.nextNode())
              text.textContent = (text.textContent ?? "").replace(/\d/g, "0");
          }),
        );
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

// contracts tasks 7.7: the seed samples (src/lib/contracts/sample.ts). Their
// ids are random, so D5 and D5b are reached from D4; contracts.spec.ts
// numbers its own contracts "…-E2ETHU", which q=MINHPHAT leaves out.
const CONTRACT_PAGES = [
  { name: "d4-contracts", from: null, link: null },
  { name: "d5a-contract-form", from: null, link: null },
  {
    name: "d5-contract",
    from: "/sales/contracts?q=MINHPHAT",
    link: /^112026\/ANPHAT-MINHPHAT$/,
  },
  {
    name: "d5b-amendment",
    from: "/sales/contracts?q=MINHPHAT",
    link: /^062026\/ANPHAT-MINHPHAT$/,
  },
] as const;

test.describe("contract baselines @visual", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "sets its own viewport");
  });

  for (const { name, from, link } of CONTRACT_PAGES) {
    for (const width of WIDTHS) {
      test(`${name} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        let path =
          name === "d4-contracts"
            ? "/sales/contracts?q=MINHPHAT"
            : "/sales/contracts/new";
        if (from && link) {
          await page.goto(from);
          await waitForHydration(page, DESKTOP_READY);
          const href =
            (await page
              .getByRole("link", { name: link })
              .getAttribute("href")) ?? "";
          path = name === "d5b-amendment" ? `${href}/amendments/1` : href;
        }
        await page.goto(path);
        await waitForHydration(page, DESKTOP_READY);
        await page.addStyleTag({
          content: "nextjs-portal { display: none !important; }",
        });
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`${name}-${width}.png`, {
          fullPage: true,
          mask: [page.locator("[data-clock]"), page.locator("[data-mask]")],
          animations: "disabled",
          caret: "hide",
        });
      });
    }
  }
});
