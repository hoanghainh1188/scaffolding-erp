import { expect, test, type Page } from "@playwright/test";

import { statePath } from "./auth-helpers";
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
/**
 * Masked dates and clocks still set their widths: "04/11" and "05/11"
 * differ by a fraction of a pixel, which moves the mask edge and the text
 * after it. Zero their digits so the layout is the same every day.
 */
async function zeroMaskedDigits(page: Page): Promise<void> {
  await page.locator("[data-mask], [data-clock]").evaluateAll((nodes) =>
    nodes.forEach((node) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode())
        text.textContent = (text.textContent ?? "").replace(/\d/g, "0");
    }),
  );
}

/** D1 has streamed every block (no skeleton left). */
async function dashboardLoaded(page: Page): Promise<void> {
  await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0, {
    timeout: 30_000,
  });
}

const PAGES = [
  // D1 as the director (dashboard-basic design D6): every number, list body
  // and the chart are masked; blocks have a fixed height.
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
  // M5: Đợt 2 of the delivery seed, waiting to be picked (deliveries 7.2).
  {
    path: `/m/deliveries/PX-${new Date().getFullYear()}-002`,
    name: "m5-picking",
    ready: MOBILE_READY,
  },
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
        // D1 streams its blocks: shoot once every block is in.
        if (name === "dashboard") await dashboardLoaded(page);
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
        await zeroMaskedDigits(page);
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
  // deliveries tasks 7.2: D6 of the An Phú rental with the seed batches
  // (src/lib/deliveries/sample.ts); their dates are masked.
  {
    name: "d6-site-deliveries",
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
          path =
            name === "d5b-amendment"
              ? `${href}/amendments/1`
              : name === "d6-site-deliveries"
                ? `${href}/deliveries`
                : href;
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

// returns-and-compensation tasks 7.2: M4 and D8 of the seed return at
// Chung cư An Phú – Block B (src/lib/returns/sample.ts). Ids and codes
// change with the database, so both are reached from a list.
test.describe("return baselines @visual", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "sets its own viewport");
  });

  for (const width of WIDTHS) {
    test(`d8-compensation at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/sales/compensations?status=ALL");
      await waitForHydration(page, DESKTOP_READY);
      const href =
        (await page
          .getByRole("row")
          .filter({ hasText: "Chung cư An Phú – Block B" })
          .first()
          .getByRole("link")
          .getAttribute("href")) ?? "";
      await page.goto(href);
      await waitForHydration(page, DESKTOP_READY);
      await page.addStyleTag({
        content: "nextjs-portal { display: none !important; }",
      });
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`d8-compensation-${width}.png`, {
        fullPage: true,
        mask: [page.locator("[data-clock]"), page.locator("[data-mask]")],
        animations: "disabled",
        caret: "hide",
      });
    });

    test(`m4-return at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/m/returns/new?q=An%20Ph%C3%BA");
      await waitForHydration(page, MOBILE_READY);
      await page
        .getByRole("link", { name: /Chung cư An Phú – Block B/ })
        .click();
      await waitForHydration(page, MOBILE_READY);
      await expect(page.getByText(/mã đã đếm/)).toBeVisible();
      await page.addStyleTag({
        content: "nextjs-portal { display: none !important; }",
      });
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`m4-return-${width}.png`, {
        fullPage: true,
        mask: [page.locator("[data-clock]"), page.locator("[data-mask]")],
        animations: "disabled",
        caret: "hide",
      });
    });
  }
});

// site-operations tasks 7.3: D6b, D6c, D6d of the An Phú rental and M9 of
// the sample transfer (src/lib/site-transfers/sample.ts). Codes and ids
// change with the database, so every page is reached from a list.
test.describe("site operation baselines @visual", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "sets its own viewport");
  });

  async function anPhuDeliveries(page: Page): Promise<string> {
    await page.goto("/sales/contracts?q=MINHPHAT");
    await waitForHydration(page, DESKTOP_READY);
    const href =
      (await page
        .getByRole("link", { name: /^062026\/ANPHAT-MINHPHAT$/ })
        .getAttribute("href")) ?? "";
    return `${href}/deliveries`;
  }

  async function shoot(page: Page, name: string, ready: string) {
    await waitForHydration(page, ready);
    await zeroMaskedDigits(page);
    await page.addStyleTag({
      content: "nextjs-portal { display: none !important; }",
    });
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      mask: [page.locator("[data-clock]"), page.locator("[data-mask]")],
      animations: "disabled",
      caret: "hide",
    });
  }

  for (const width of WIDTHS) {
    test(`d6b-site-transfer at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const d6 = await anPhuDeliveries(page);
      await page.goto(d6.replace(/\/deliveries$/, "/site-transfer/new"));
      await shoot(page, `d6b-site-transfer-${width}`, DESKTOP_READY);
    });

    test(`d6c-buy-back at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(await anPhuDeliveries(page));
      await waitForHydration(page, DESKTOP_READY);
      const href =
        (await page
          .getByRole("link", { name: /^Mua lại MLA-/ })
          .first()
          .getAttribute("href")) ?? "";
      await page.goto(href);
      await shoot(page, `d6c-buy-back-${width}`, DESKTOP_READY);
    });

    test(`d6d-exchange at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const d6 = await anPhuDeliveries(page);
      await page.goto(d6.replace(/\/deliveries$/, "/exchange/new"));
      await shoot(page, `d6d-exchange-${width}`, DESKTOP_READY);
    });

    test(`m9-site-transfer at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/m");
      await waitForHydration(page, MOBILE_READY);
      const href =
        (await page
          .getByRole("article")
          .filter({ hasText: "Chung cư An Phú – Block B →" })
          .getByRole("link", { name: "Xác nhận" })
          .first()
          .getAttribute("href")) ?? "";
      await page.goto(href);
      await shoot(page, `m9-site-transfer-${width}`, MOBILE_READY);
    });
  }
});

// rental-billing design D14: only what does not depend on the day. The E2E
// rental gains lines on every run and the running month stops at today, so
// D7 is shot on 02/2099 (the fixed sample holiday of global setup, no
// contract yet) and the holiday settings on 2099; amounts are tested by
// unit, component and integration tests instead.
test.describe("billing baselines @visual", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "sets its own viewport");
  });

  const BILLING_PAGES = [
    { path: "/receivables/billing?month=2099-02", name: "d7-rental-billing" },
    { path: "/settings/holidays?year=2099", name: "settings-holidays" },
  ];

  for (const { path, name } of BILLING_PAGES) {
    for (const width of WIDTHS) {
      test(`${name} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
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

// receivables design D10: the customers and debts change on every run, so
// D14 is shot with a search that matches nobody (tiles masked) and D14b is
// not shot; amounts are tested by unit, component and integration tests.
test.describe("receivables baselines @visual", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "sets its own viewport");
  });

  for (const width of WIDTHS) {
    test(`d14-receivables at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/receivables?filter=all&q=khong-ai-ca-e2e");
      await waitForHydration(page, DESKTOP_READY);
      await page.addStyleTag({
        content: "nextjs-portal { display: none !important; }",
      });
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`d14-receivables-${width}.png`, {
        fullPage: true,
        mask: [page.locator("[data-clock]"), page.locator("[data-mask]")],
        animations: "disabled",
        caret: "hide",
      });
    });
  }
});

// payables design D10: like D14, sellers and receipts change on every run,
// so D14c is shot with a search that matches nobody (tiles masked).
test.describe("payables baselines @visual", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "sets its own viewport");
  });

  for (const width of WIDTHS) {
    test(`d14c-payables at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/payables?filter=all&q=khong-ai-ca-e2e");
      await waitForHydration(page, DESKTOP_READY);
      await page.addStyleTag({
        content: "nextjs-portal { display: none !important; }",
      });
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`d14c-payables-${width}.png`, {
        fullPage: true,
        mask: [page.locator("[data-clock]"), page.locator("[data-mask]")],
        animations: "disabled",
        caret: "hide",
      });
    });
  }
});

// management-reports design D6: D15 for January 2020, before any data on
// every database, so every number is 0 ₫ or "—" and nothing is masked.
test.describe("reports baselines @visual", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "sets its own viewport");
  });

  for (const width of WIDTHS) {
    test(`d15-reports at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/reports?period=month&value=2020-01");
      await waitForHydration(page, DESKTOP_READY);
      await page.addStyleTag({
        content: "nextjs-portal { display: none !important; }",
      });
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`d15-reports-${width}.png`, {
        fullPage: true,
        mask: [page.locator("[data-clock]"), page.locator("[data-mask]")],
        animations: "disabled",
        caret: "hide",
      });
    });
  }
});

// dashboard-basic design D6: D1 as sales (scope "Cả hai"), so a money block
// showing up for a role without receivables.view changes the image.
test.describe("dashboard baselines @visual", () => {
  test.use({ storageState: statePath("SALES") });
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "sets its own viewport");
  });

  for (const width of WIDTHS) {
    test(`dashboard-sales at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/dashboard");
      await waitForHydration(page, DESKTOP_READY);
      await dashboardLoaded(page);
      await page.addStyleTag({
        content: "nextjs-portal { display: none !important; }",
      });
      await zeroMaskedDigits(page);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`dashboard-sales-${width}.png`, {
        fullPage: true,
        mask: [page.locator("[data-clock]"), page.locator("[data-mask]")],
        animations: "disabled",
        caret: "hide",
      });
    });
  }
});

// repair-work-orders task 9.4: the seed's work orders (src/lib/repairs/
// work-sample.ts), reached from their lists since codes follow the
// database: D12 of the order counted like drawing D12 (money masked, the
// averages move with other tests), M8 of the one being repaired.
test.describe("repair work order baselines @visual", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "sets its own viewport");
  });

  async function shoot(page: Page, name: string) {
    await zeroMaskedDigits(page);
    await page.addStyleTag({
      content: "nextjs-portal { display: none !important; }",
    });
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      mask: [page.locator("[data-clock]"), page.locator("[data-mask]")],
      animations: "disabled",
      caret: "hide",
    });
  }

  for (const width of WIDTHS) {
    test(`d12-work-order at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/repairs?status=counted");
      await waitForHydration(page, DESKTOP_READY);
      await page
        .getByRole("link", { name: /^PSC-\d{4}-\d{3,}$/ })
        .last()
        .click();
      await expect(
        page.getByRole("heading", { level: 1, name: /^Lệnh sửa chữa/ }),
      ).toBeVisible();
      await waitForHydration(page, DESKTOP_READY);
      await shoot(page, `d12-work-order-${width}`);
    });

    test(`m8-repair at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/m/repairs");
      await waitForHydration(page, MOBILE_READY);
      await page.getByRole("link", { name: "Tiếp tục" }).last().click();
      await expect(page.getByText("Lệnh sửa chữa").first()).toBeVisible();
      await waitForHydration(page, MOBILE_READY);
      await shoot(page, `m8-repair-${width}`);
    });
  }
});
