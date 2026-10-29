import { expect, test } from "@playwright/test";

import {
  DESKTOP_READY,
  MOBILE_READY,
  expectNoHorizontalScroll,
  runOnlyIn,
  sidebarState,
  waitForHydration,
} from "./helpers";

const WIDTHS = [360, 375, 768, 1024, 1280, 1366] as const;
/** The D3 sample order: the first order of a fresh database. */
const SAMPLE_ORDER = `PO-${new Date().getFullYear()}-001`;
const PAGES = [
  { path: "/dashboard", ready: DESKTOP_READY },
  { path: "/inventory", ready: DESKTOP_READY },
  {
    path: "/inventory/items/GG-K17?from=2026-10-01&to=2026-10-31",
    ready: DESKTOP_READY,
  },
  { path: "/inventory/adjustments", ready: DESKTOP_READY },
  { path: "/purchasing", ready: DESKTOP_READY },
  { path: "/purchasing/orders/new", ready: DESKTOP_READY },
  { path: `/purchasing/orders/${SAMPLE_ORDER}`, ready: DESKTOP_READY },
  { path: "/settings/users", ready: DESKTOP_READY },
  {
    path: "/settings/activity?from=2026-10-27&to=2026-10-28",
    ready: DESKTOP_READY,
  },
  { path: "/catalog/items?item=GG-K17", ready: DESKTOP_READY },
  { path: "/catalog/partners?tab=customers", ready: DESKTOP_READY },
  { path: "/change-password", ready: null },
  { path: "/m", ready: MOBILE_READY },
  { path: "/m/history", ready: MOBILE_READY },
  { path: "/dev/components", ready: null },
] as const;

test.describe("responsive layout", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "sets its own viewport");
  });

  for (const width of WIDTHS) {
    test(`no page scrolls sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const { path, ready } of PAGES) {
        await page.goto(path);
        if (ready) await waitForHydration(page, ready);
        await expectNoHorizontalScroll(page);
      }
    });
  }

  for (const [width, expected] of [
    [900, "drawer"],
    [1100, "collapsed"],
    [1366, "expanded"],
  ] as const) {
    test(`sidebar is ${expected} at ${width}px by default`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/inventory");
      await waitForHydration(page, DESKTOP_READY);
      expect(await sidebarState(page)).toBe(expected);
    });
  }

  test("an expanded sidebar at 1100px stays expanded after a reload", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto("/inventory");
    await waitForHydration(page, DESKTOP_READY);
    await page.getByRole("button", { name: "Mở rộng menu" }).click();
    expect(await sidebarState(page)).toBe("expanded");

    await page.reload();
    await waitForHydration(page, DESKTOP_READY);
    expect(await sidebarState(page)).toBe("expanded");
    await expect(page.locator("[data-slot=sidebar-container]")).toHaveCSS(
      "width",
      "256px",
    );
  });

  test("the mobile area is 640px wide and centred on a wide screen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 800 });
    await page.goto("/m");
    await waitForHydration(page, MOBILE_READY);
    const tabs = await page
      .locator("nav[aria-label='Điều hướng chính'] ul")
      .boundingBox();
    const content = await page.locator("main").locator("..").boundingBox();
    expect(tabs?.width).toBe(640);
    expect(content?.width).toBe(640);
    expect(tabs?.x).toBe((1366 - 640) / 2);
    expect(content?.x).toBe((1366 - 640) / 2);
  });

  test("a wide table scrolls inside its frame with the first column pinned", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto("/dev/components");
    const frame = page.getByRole("region", { name: "Tồn kho mẫu" });
    const firstCell = frame.getByRole("cell", { name: "KG-170" });
    await firstCell.scrollIntoViewIfNeeded();

    const sizes = await frame.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client);

    const before = await firstCell.boundingBox();
    await frame.evaluate((el) => el.scrollBy({ left: 300 }));
    const after = await firstCell.boundingBox();
    expect(after?.x).toBe(before?.x);
    await expectNoHorizontalScroll(page);
  });
});
