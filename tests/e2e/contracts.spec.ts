// D4, D5, D5a, D5b flows (contracts tasks 7.7). Contracts made here carry
// the customer part "E2ETHU" in their number; global setup cancels them
// before each run (numbers stay used). The sample contracts of
// src/lib/contracts/sample.ts are left alone for the screenshots.
import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  createAccount,
  signedOutPage,
  signInThroughForm,
  statePath,
  tempUsername,
} from "./auth-helpers";
import { DESKTOP_READY, runOnlyIn, waitForHydration } from "./helpers";

const desktopOnly = () =>
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop screens");
  });

async function open(page: Page, path: string) {
  await page.goto(path);
  await waitForHydration(page, DESKTOP_READY);
}

async function asDirector(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    storageState: statePath("DIRECTOR"),
  });
  return context.newPage();
}

async function pick(page: Page, label: string, text: string) {
  const select = page.getByLabel(label, { exact: true });
  const value = await select
    .locator("option", { hasText: text })
    .first()
    .getAttribute("value");
  await select.selectOption(value ?? "");
}

test.describe("contracts", () => {
  desktopOnly();
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: statePath("SALES") });

  test("drafts a rental from a kit, sends it, the director approves, then amends it", async ({
    page,
    browser,
  }) => {
    await open(page, "/sales/contracts/new");
    await pick(page, "Nhà thầu", "Minh Phát");
    await pick(page, "Công trình", "Trường THCS Dương Nội");
    await page.getByLabel("Số hợp đồng").fill("E2E thu");
    await page.getByLabel("Thuê từ ngày").fill("01/01/2030");
    await page.getByLabel("Đến ngày (dự kiến)").fill("21/05/2030");
    await pick(page, "Thêm bộ", "BO-17");
    await page.getByRole("button", { name: "Thêm bộ", exact: true }).click();
    await page.getByLabel("Số bộ Bộ giàn giáo 1,7m").fill("300");
    // 600 × 1.200 + 600 × 300 + 300 × 900 = 1.170.000 ₫ a day.
    await expect(
      page.getByRole("row", { name: /Tiền thuê 1 ngày/ }),
    ).toContainText("1.170.000 ₫");
    await expect(page.getByText(/^Sẽ là 012030\/.*-E2ETHU/)).toBeVisible();

    await page.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(page).toHaveURL(/\/sales\/contracts\/[0-9a-f-]+\/edit/);
    const id = page.url().replace(/.*\/contracts\/([0-9a-f-]+)\/edit.*/, "$1");

    const print = await page.context().newPage();
    await print.goto(`/sales/contracts/${id}/print`);
    await expect(
      print.getByRole("heading", { level: 1, name: /^Báo giá 012030\// }),
    ).toBeVisible();
    await print.close();

    await page
      .getByRole("button", { name: "Gửi Giám đốc duyệt" })
      .filter({ visible: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/sales/contracts/${id}$`));
    await expect(
      page
        .getByText("Chờ duyệt", { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Duyệt hợp đồng" }),
    ).toHaveCount(0);

    const director = await asDirector(browser);
    await open(director, `/sales/contracts/${id}`);
    await expect(
      director.getByRole("heading", {
        name: "Hợp đồng này đang chờ bạn duyệt",
      }),
    ).toBeVisible();
    await director.getByRole("button", { name: "Duyệt hợp đồng" }).click();
    await expect(
      director.getByRole("button", { name: "Lập phụ lục" }),
    ).toBeVisible();

    await open(page, `/sales/contracts/${id}`);
    await page.getByRole("button", { name: "Lập phụ lục" }).click();
    await expect(page).toHaveURL(/\/amendments\/1$/);
    await page.getByLabel("Hiệu lực từ ngày").fill("01/03/2030");
    await page.getByLabel("Lý do").fill("E2E thử đổi giá chéo");
    await page.getByLabel("Giá thuê / ngày GG-CH").fill("400");
    await expect(
      page.getByText(/Trước đó 1\.170\.000 ₫ · tăng 60\.000 ₫/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Gửi Giám đốc duyệt" }).click();
    await expect(
      page.getByText("Chờ duyệt", { exact: true }).first(),
    ).toBeVisible();

    await open(director, `/sales/contracts/${id}/amendments/1`);
    await director.getByRole("button", { name: "Duyệt phụ lục" }).click();
    await expect(
      director.getByRole("heading", { name: "Phụ lục này đang chờ bạn duyệt" }),
    ).toHaveCount(0);
    await open(director, `/sales/contracts/${id}`);
    await expect(
      director.getByRole("region", { name: "Các bản của hợp đồng" }),
    ).toContainText("Phụ lục 01");
    await expect(director.getByText(/^Đang áp dụng .*\/01$/)).toBeVisible();
    await director.context().close();
  });

  test("a rental-only seller cannot open a sale contract", async ({
    browser,
  }) => {
    const director = await asDirector(browser);
    const username = tempUsername();
    const password = await createAccount(director, {
      name: "Thúy Vy",
      username,
      role: "Kinh doanh",
    });
    await director
      .getByRole("dialog", { name: "Đã tạo tài khoản" })
      .getByRole("button", { name: "Xong" })
      .click();
    await director
      .getByRole("button", { name: "Thao tác với Thúy Vy" })
      .first()
      .click();
    await director
      .getByRole("menuitem", { name: "Đổi phạm vi hợp đồng" })
      .click();
    await director.getByRole("radio", { name: "Chỉ cho thuê" }).check();
    await director.getByRole("button", { name: "Lưu phạm vi" }).click();
    await expect(
      director.getByRole("row", { name: new RegExp(username) }),
    ).toContainText("Kinh doanh · Chỉ cho thuê");

    await open(director, "/sales/contracts?type=SALE&q=TVHUNG");
    const link = director.getByRole("link", { name: /-TVHUNG/ }).first();
    const href = (await link.getAttribute("href")) ?? "";
    expect(href).toMatch(/^\/sales\/contracts\/[0-9a-f-]+$/);
    await director.context().close();

    const seller = await signedOutPage(browser);
    await signInThroughForm(seller, username, password);
    await seller.getByLabel("Mật khẩu hiện tại").fill(password);
    await seller
      .getByLabel("Mật khẩu mới", { exact: true })
      .fill("chi cho thue");
    await seller.getByLabel("Nhập lại mật khẩu mới").fill("chi cho thue");
    await seller.getByRole("button", { name: "Đổi mật khẩu" }).click();
    await expect(seller).toHaveURL(/\/dashboard$/);
    await seller.goto(href);
    await expect(
      seller.getByText("Bạn không có quyền xem trang này"),
    ).toBeVisible();
    await seller.context().close();
  });
});
