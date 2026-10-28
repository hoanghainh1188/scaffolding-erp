// Repair slips on D12 (simple-repair task 7.3). The ledger cannot be
// emptied, so the slip takes Chờ sửa of E2E-KHO-01 at the workshop (global
// setup tops it up; no other spec reads it) into the yard, and the test
// checks differences: Tốt at the yard and the workshop column of D10.
import { expect, test, type Browser, type Page } from "@playwright/test";

import { statePath } from "./auth-helpers";
import { E2E_ORDER_NOTE } from "./global-setup";
import { DESKTOP_READY, runOnlyIn, waitForHydration } from "./helpers";

test.beforeEach(({}, testInfo) => {
  test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop screens");
});

async function as(browser: Browser, role: "ACCOUNTANT" | "SALES") {
  const context = await browser.newContext({ storageState: statePath(role) });
  return context.newPage();
}

/** D10 cell of E2E-KHO-01: 1 Tốt at the yard, 4 Tại xưởng. */
async function stock(page: Page, column: number): Promise<number> {
  await page.goto("/inventory?q=e2e-kho-01");
  await waitForHydration(page, DESKTOP_READY);
  const row = page.getByRole("row", { name: /E2E-KHO-01/ });
  const text = await row.locator("td").nth(column).innerText();
  return Number(text.replaceAll(".", ""));
}

test("Kế toán posts a repair slip after checking a high cost", async ({
  browser,
}) => {
  const page = await as(browser, "ACCOUNTANT");
  const goodBefore = await stock(page, 1);
  const workshopBefore = await stock(page, 4);

  await page.goto("/repairs");
  await waitForHydration(page, DESKTOP_READY);
  await page.getByRole("link", { name: "Phiếu mới" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Phiếu sửa chữa mới" }),
  ).toBeVisible();
  await waitForHydration(page, DESKTOP_READY);
  await page
    .getByLabel("Lấy hàng Chờ sửa tại")
    .selectOption({ label: "Xưởng · XUONG-01" });
  await page
    .getByRole("button", { name: /^Thêm Vật tư kho thử 1 \(E2E-KHO-01\)/ })
    .click();
  await page.getByLabel("Lấy ra sửa E2E-KHO-01").fill("2");
  await page.getByLabel("Hỏng hẳn E2E-KHO-01").fill("1");
  await expect(page.getByLabel("Sửa xong E2E-KHO-01")).toHaveValue("1");
  await page.getByLabel("Chi phí sửa E2E-KHO-01").fill("50000000");
  await page.getByLabel("Ghi chú").fill(E2E_ORDER_NOTE);
  await expect(
    page.getByRole("article", { name: "Giá vốn sau sửa E2E-KHO-01" }),
  ).toContainText("1 cái hỏng hẳn vào Phế liệu");

  // A cost per piece above the Tốt average asks first.
  await page.getByRole("button", { name: "Ghi sổ kho" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(
    "E2E-KHO-01: chi phí sửa 50.000.000 ₫/cái",
  );
  await dialog.getByRole("button", { name: "Sửa lại" }).click();
  await page.getByLabel("Chi phí sửa E2E-KHO-01").fill("0");
  await page.getByRole("button", { name: "Ghi sổ kho" }).click();

  await expect(page).toHaveURL(/\/repairs\/PSC-\d{4}-\d{3,}$/);
  await expect(
    page.getByText("Đã ghi sổ").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Giá vốn sau sửa" }),
  ).toBeVisible();
  const url = page.url();

  expect(await stock(page, 1)).toBe(goodBefore + 1);
  expect(await stock(page, 4)).toBe(workshopBefore - 2);

  // Kinh doanh reads the slip but cannot post anything.
  const sales = await as(browser, "SALES");
  await sales.goto(url);
  await waitForHydration(sales, DESKTOP_READY);
  await expect(
    sales.getByText("Đã ghi sổ").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(sales.getByRole("button", { name: "Ghi sổ kho" })).toHaveCount(
    0,
  );
  await sales.goto("/repairs");
  await expect(sales.getByRole("link", { name: "Phiếu mới" })).toHaveCount(0);
});
