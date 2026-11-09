// Production orders on D19, D20 and M10 (production-orders task 5.3). The
// ledger cannot be emptied, so orders make E2E-SX-01 from E2E-VT-02 (global
// setup keeps ≥ 50 kg at XUONG-01) and the test checks differences of D10,
// which only this file moves. Serial: every test uses the same items.
import { expect, test, type Browser, type Page } from "@playwright/test";

import { statePath } from "./auth-helpers";
import { E2E_PRODUCT_ITEM, E2E_RAW_ITEM } from "./global-setup";
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

type Role = "ACCOUNTANT" | "DIRECTOR" | "SALES" | "WORKSHOP" | "WAREHOUSE";

async function as(browser: Browser, role: Role): Promise<Page> {
  const context = await browser.newContext({ storageState: statePath(role) });
  return context.newPage();
}

const NUMBER = /[\d.,]+/;

/** D10 cell: 0 Mới at the yard, 6 Tổng (the material is only at the workshop). */
async function stock(page: Page, code: string, column: number) {
  await page.goto(`/inventory?q=${code.toLowerCase()}`);
  await waitForHydration(page, DESKTOP_READY);
  const row = page.getByRole("row", { name: new RegExp(code) });
  const text = await row.locator("td").nth(column).innerText();
  const found = NUMBER.exec(text)?.[0] ?? "0";
  return Number(found.replaceAll(".", "").replace(",", "."));
}

/** Lệnh mới → 2 E2E-SX-01 → Giao xưởng; its code. */
async function assignedOrder(office: Page): Promise<string> {
  await office.goto("/production/new");
  await waitForHydration(office, DESKTOP_READY);
  await office
    .getByLabel("Mã hàng")
    .selectOption({ label: `${E2E_PRODUCT_ITEM} · Thành phẩm thử E2E` });
  await office.getByLabel("Số kế hoạch").fill("2");
  await expect(office.getByText(`${E2E_RAW_ITEM} 4 kg`)).toBeVisible();
  await office.getByRole("button", { name: "Giao xưởng" }).click();
  await expect(office).toHaveURL(/\/production\/LSX-\d{4}-\d{3,}$/);
  await expect(
    office.getByText("Đã giao").filter({ visible: true }).first(),
  ).toBeVisible();
  return office.url().split("/").at(-1) ?? "";
}

async function take(workshop: Page, code: string) {
  await workshop.goto(`/m/production/${code}`);
  await waitForHydration(workshop, MOBILE_READY);
  await workshop.getByRole("button", { name: "Nhận lệnh" }).click();
  await expect(
    workshop.getByText("Đang làm").filter({ visible: true }).first(),
  ).toBeVisible();
}

const RAW_FIELD = "Nguyên liệu thử E2E thực dùng (kg)";

/** M10: leave the prefilled numbers, or type another material use. */
async function report(workshop: Page, code: string, used?: string) {
  await workshop.goto(`/m/production/${code}`);
  await waitForHydration(workshop, MOBILE_READY);
  const field = workshop.getByRole("textbox", { name: RAW_FIELD });
  await expect(field).toHaveValue("4");
  if (used) {
    await field.fill(used);
    await field.blur();
    await expect(
      workshop.getByText(/vượt định mức 12,5 %: văn phòng sẽ hỏi Giám đốc/),
    ).toBeVisible();
  }
  await workshop.getByRole("button", { name: "Báo làm xong" }).click();
  await expect(workshop).toHaveURL(/\/m\/production$/);
}

async function count(storekeeper: Page, code: string, used = "4") {
  await storekeeper.goto(`/m/production/${code}`);
  await waitForHydration(storekeeper, MOBILE_READY);
  await expect(
    storekeeper.getByRole("textbox", { name: RAW_FIELD }),
  ).toHaveValue(used);
  await storekeeper.getByRole("button", { name: "Đếm xong" }).click();
  await expect(storekeeper).toHaveURL(/\/m\/production$/);
}

async function open(office: Page, code: string) {
  await office.goto(`/production/${code}`);
  await waitForHydration(office, DESKTOP_READY);
}

async function postIt(office: Page, code: string) {
  await open(office, code);
  await office.getByRole("button", { name: "Ghi sổ" }).click();
  await expect(
    office.getByText("Đã ghi sổ").filter({ visible: true }).first(),
  ).toBeVisible();
}

test("an order goes office → workshop → storekeeper → ledger", async ({
  browser,
}) => {
  const office = await as(browser, "ACCOUNTANT");
  const finishedBefore = await stock(office, E2E_PRODUCT_ITEM, 0);
  const rawBefore = await stock(office, E2E_RAW_ITEM, 6);

  const code = await assignedOrder(office);
  const workshop = await as(browser, "WORKSHOP");
  await take(workshop, code);
  await report(workshop, code);
  const storekeeper = await as(browser, "WAREHOUSE");
  await count(storekeeper, code);

  await open(office, code);
  await expect(office.getByText(/tạm tính/).first()).toBeVisible();
  await postIt(office, code);

  expect(await stock(office, E2E_PRODUCT_ITEM, 0)).toBe(finishedBefore + 2);
  expect(await stock(office, E2E_RAW_ITEM, 6)).toBe(rawBefore - 4);

  // The phone never gets a money key; who may do what is checked server-side.
  const phone = await workshop.request.get(`/api/m/production/${code}`);
  expect(JSON.stringify(await phone.json())).not.toMatch(
    /"[^"]*(price|cost|amount|rate|labor|value)[^"]*":/i,
  );
  expect(
    (
      await workshop.request.post(`/api/production/orders/${code}/post`, {
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await storekeeper.request.post(`/api/production/orders/${code}/post`, {
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect((await office.request.get("/api/m/production")).status()).toBe(403);

  // Kinh doanh reads the order but has no button.
  const sales = await as(browser, "SALES");
  await open(sales, code);
  await expect(sales.getByRole("button", { name: "Hủy lệnh" })).toHaveCount(0);
  await sales.goto("/production");
  await expect(sales.getByRole("link", { name: "Lệnh mới" })).toHaveCount(0);
});

test("overuse waits for the director before posting", async ({ browser }) => {
  const office = await as(browser, "ACCOUNTANT");
  const code = await assignedOrder(office);
  const workshop = await as(browser, "WORKSHOP");
  await take(workshop, code);
  await report(workshop, code, "4,5");
  const storekeeper = await as(browser, "WAREHOUSE");
  await count(storekeeper, code, "4,5");

  await open(office, code);
  await expect(
    office.getByText("Chờ Giám đốc duyệt").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(office.getByRole("button", { name: "Ghi sổ" })).toHaveCount(0);
  await expect(
    office.getByRole("button", { name: "Duyệt vượt định mức" }),
  ).toHaveCount(0);

  const director = await as(browser, "DIRECTOR");
  await open(director, code);
  await director.getByLabel("Ghi chú duyệt").fill("E2E chấp nhận");
  await director.getByRole("button", { name: "Duyệt vượt định mức" }).click();
  await expect(
    director.getByText("Chờ ghi sổ").filter({ visible: true }).first(),
  ).toBeVisible();

  await postIt(office, code);
});

test("the office sends an order back to the workshop", async ({ browser }) => {
  const office = await as(browser, "ACCOUNTANT");
  const code = await assignedOrder(office);
  const workshop = await as(browser, "WORKSHOP");
  await take(workshop, code);
  await report(workshop, code);

  await open(office, code);
  await office.getByRole("button", { name: "Trả lại xưởng sửa số" }).click();
  await office.getByLabel("Ghi chú").fill("Kiểm lại nguyên liệu");
  await office.getByRole("button", { name: "Trả lại xưởng" }).click();
  await expect(
    office.getByText("Văn phòng trả lại: Kiểm lại nguyên liệu"),
  ).toBeVisible();

  await workshop.goto(`/m/production/${code}`);
  await waitForHydration(workshop, MOBILE_READY);
  await expect(
    workshop.getByText("Văn phòng trả lại: Kiểm lại nguyên liệu"),
  ).toBeVisible();

  await open(office, code);
  await office.getByRole("button", { name: "Hủy lệnh" }).click();
  await office.getByLabel("Lý do").fill("E2E thử hủy");
  await office
    .getByRole("dialog")
    .getByRole("button", { name: "Hủy lệnh" })
    .click();
  await expect(
    office.getByText("Đã hủy").filter({ visible: true }).first(),
  ).toBeVisible();
});
