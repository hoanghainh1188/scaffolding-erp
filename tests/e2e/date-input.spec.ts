// Issue #37: date fields read and show dd/mm/yyyy whatever the browser
// language. The browser here is American English, where a native
// <input type="date"> would show mm/dd/yyyy.
import { expect, test } from "@playwright/test";

import { DESKTOP_READY, runOnlyIn, waitForHydration } from "./helpers";

test.use({ locale: "en-US" });

test.beforeEach(({}, testInfo) => {
  test.skip(!runOnlyIn(testInfo, "desktop-1280"), "one desktop size is enough");
});

test("D11 period filter shows, types and picks dd/mm/yyyy in en-US", async ({
  page,
}) => {
  await page.goto("/inventory/items/E2E-KHO-01?from=2026-10-01&to=2026-10-31");
  await waitForHydration(page, DESKTOP_READY);

  const from = page.getByLabel("Từ ngày").filter({ visible: true });
  const to = page.getByLabel("Đến ngày").filter({ visible: true });
  await expect(from).toHaveValue("01/10/2026");
  await expect(to).toHaveValue("31/10/2026");

  // Typed day first: 5/11 is 5 November, not 11 May.
  await from.fill("5/11/2026");
  await from.press("Tab");
  await expect(from).toHaveValue("05/11/2026");

  await to.fill("31/04/2026");
  await to.press("Tab");
  await expect(page.getByText("Không có ngày 31/04/2026")).toBeVisible();
  await expect(to).toHaveValue("31/10/2026");

  // Pick 30 November from the calendar next to "Đến ngày".
  await to.fill("15/11/2026");
  await to.press("Tab");
  await page
    .getByRole("button", { name: "Mở lịch" })
    .filter({ visible: true })
    .nth(1)
    .click();
  const grid = page.getByRole("grid");
  await expect(grid).toBeVisible();
  await grid.getByRole("button").filter({ hasText: /^30$/ }).last().click();
  await expect(to).toHaveValue("30/11/2026");

  await page.getByRole("button", { name: "Xem" }).click();
  await expect(page).toHaveURL(/from=2026-11-05/);
  await expect(page).toHaveURL(/to=2026-11-30/);
});
