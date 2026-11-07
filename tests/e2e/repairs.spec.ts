// Repair work orders on D12 and M8 (repair-work-orders task 9.3). A new
// repair is a work order (0.2 số 121). The ledger cannot be emptied, so the
// order takes 2 Chờ sửa of E2E-KHO-01 at BAI-01 (global setup tops it up)
// and the test checks differences of the D10 workshop column, which only
// this file moves. Serial: both tests move E2E-KHO-01 through XUONG-01.
import { expect, test, type Browser, type Page } from "@playwright/test";

import { statePath } from "./auth-helpers";
import { E2E_SUPPLY_ITEM } from "./global-setup";
import {
  DESKTOP_READY,
  MOBILE_READY,
  runOnlyIn,
  waitForHydration,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(({}, testInfo) => {
  test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop screens");
});

type Role = "ACCOUNTANT" | "SALES" | "WORKSHOP" | "WAREHOUSE";

async function as(browser: Browser, role: Role): Promise<Page> {
  const context = await browser.newContext({ storageState: statePath(role) });
  return context.newPage();
}

/** D10 cell of E2E-KHO-01: 4 is Tại xưởng. */
async function stock(page: Page, column: number): Promise<number> {
  await page.goto("/inventory?q=e2e-kho-01");
  await waitForHydration(page, DESKTOP_READY);
  const row = page.getByRole("row", { name: /E2E-KHO-01/ });
  const text = await row.locator("td").nth(column).innerText();
  return Number(text.replaceAll(".", ""));
}

/** Lệnh mới → 2 E2E-KHO-01 from the first yard → Giao xưởng; its code. */
async function assignedOrder(office: Page): Promise<string> {
  await office.goto("/repairs");
  await waitForHydration(office, DESKTOP_READY);
  await office.getByRole("link", { name: "Lệnh mới" }).click();
  await expect(
    office.getByRole("heading", { level: 1, name: "Lệnh sửa chữa mới" }),
  ).toBeVisible();
  await waitForHydration(office, DESKTOP_READY);
  await office.getByRole("button", { name: /\(E2E-KHO-01\)/ }).click();
  await office.getByLabel("Lấy ra").fill("2");
  await office.getByRole("button", { name: "Giao xưởng" }).click();
  await expect(office).toHaveURL(/\/repairs\/PSC-\d{4}-\d{3,}$/);
  await expect(
    office.getByText("Đã giao").filter({ visible: true }).first(),
  ).toBeVisible();
  return office.url().split("/").at(-1) ?? "";
}

/** M8: the workshop takes the order (yard → workshop on the ledger). */
async function take(workshop: Page, code: string) {
  await workshop.goto(`/m/repairs/${code}`);
  await waitForHydration(workshop, MOBILE_READY);
  await workshop.getByRole("button", { name: "Nhận lệnh" }).click();
  await workshop
    .getByRole("alertdialog", { name: "Nhận lệnh" })
    .getByRole("button", { name: "Nhận lệnh" })
    .click();
  await expect(
    workshop.getByText("Đang sửa").filter({ visible: true }).first(),
  ).toBeVisible();
}

/** M8: 2 repaired, 0,5 kg of the E2E supply, Báo sửa xong. */
async function report(workshop: Page, code: string) {
  await workshop.goto(`/m/repairs/${code}`);
  await waitForHydration(workshop, MOBILE_READY);
  const card = workshop.getByRole("article", { name: "E2E-KHO-01" });
  const more = card.getByRole("button", { name: "Tăng" }).first();
  await more.click();
  await more.click();
  await card.getByRole("button", { name: "Thêm vật tư" }).click();
  await card
    .getByLabel("Chọn vật tư cho E2E-KHO-01")
    .selectOption({ label: `Vật tư thử E2E · ${E2E_SUPPLY_ITEM}` });
  const supply = card.getByRole("textbox", {
    name: new RegExp(E2E_SUPPLY_ITEM),
  });
  await supply.fill("0,5");
  await supply.blur();
  await expect(
    workshop.getByText(/2 sửa xong · 0 phế · đủ 2 \/ 2/),
  ).toBeVisible();
  await workshop.getByRole("button", { name: "Báo sửa xong" }).click();
  await expect(workshop).toHaveURL(/\/m\/repairs$/);
}

test("a work order goes office → workshop → storekeeper → office", async ({
  browser,
}) => {
  const office = await as(browser, "ACCOUNTANT");
  const before = await stock(office, 4);
  const code = await assignedOrder(office);

  const workshop = await as(browser, "WORKSHOP");
  await take(workshop, code);
  expect(await stock(office, 4)).toBe(before + 2);
  await report(workshop, code);

  const storekeeper = await as(browser, "WAREHOUSE");
  await storekeeper.goto(`/m/repairs/${code}`);
  await waitForHydration(storekeeper, MOBILE_READY);
  await expect(
    storekeeper.getByText("Xưởng báo 2 sửa xong, 0 phế"),
  ).toBeVisible();
  await storekeeper.getByRole("button", { name: "Đếm xong" }).click();
  await expect(storekeeper).toHaveURL(/\/m\/repairs$/);

  await office.goto(`/repairs/${code}`);
  await waitForHydration(office, DESKTOP_READY);
  await expect(
    office.getByText("Chờ ghi sổ").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(office.getByText(/Công khoán: 2 × 10\.000 ₫/)).toBeVisible();
  await office.getByRole("button", { name: "Ghi sổ kho" }).click();
  await expect(
    office.getByText("Đã ghi sổ").filter({ visible: true }).first(),
  ).toBeVisible();
  // In at the workshop on receiving, out again on posting.
  expect(await stock(office, 4)).toBe(before);

  // The workshop and the storekeeper never post; the office never uses M8.
  expect(
    (
      await workshop.request.post(`/api/repairs/${code}/post`, { data: {} })
    ).status(),
  ).toBe(403);
  expect(
    (
      await storekeeper.request.post(`/api/repairs/${code}/post`, { data: {} })
    ).status(),
  ).toBe(403);
  expect((await office.request.get("/api/m/repairs")).status()).toBe(403);

  // Kinh doanh reads the order but has no button.
  const sales = await as(browser, "SALES");
  await sales.goto(`/repairs/${code}`);
  await waitForHydration(sales, DESKTOP_READY);
  await expect(sales.getByRole("button", { name: "Ghi sổ kho" })).toHaveCount(
    0,
  );
  await sales.goto("/repairs");
  await expect(sales.getByRole("link", { name: "Lệnh mới" })).toHaveCount(0);
});

test("the office sends an order back, then cancels it", async ({ browser }) => {
  const office = await as(browser, "ACCOUNTANT");
  const before = await stock(office, 4);
  const code = await assignedOrder(office);
  const workshop = await as(browser, "WORKSHOP");
  await take(workshop, code);
  await report(workshop, code);

  await office.goto(`/repairs/${code}`);
  await waitForHydration(office, DESKTOP_READY);
  await office.getByRole("button", { name: "Trả lại xưởng sửa số" }).click();
  await office.getByLabel("Lý do").fill("Kiểm lại vật tư");
  await office.getByRole("button", { name: "Trả lại xưởng" }).click();
  await expect(
    office.getByText("Văn phòng trả lại: Kiểm lại vật tư"),
  ).toBeVisible();

  await workshop.goto(`/m/repairs/${code}`);
  await waitForHydration(workshop, MOBILE_READY);
  await expect(
    workshop.getByText("Văn phòng trả lại: Kiểm lại vật tư"),
  ).toBeVisible();

  await office.getByRole("button", { name: "Hủy lệnh" }).click();
  await office.getByLabel("Lý do").fill("E2E thử hủy");
  await office
    .getByRole("dialog")
    .getByRole("button", { name: "Hủy lệnh" })
    .click();
  await expect(
    office.getByText("Đã hủy").filter({ visible: true }).first(),
  ).toBeVisible();
  // The stock the workshop took went back to the yard.
  expect(await stock(office, 4)).toBe(before);
});
