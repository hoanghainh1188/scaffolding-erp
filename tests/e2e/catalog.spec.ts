import { expect, test } from "@playwright/test";

import { statePath } from "./auth-helpers";
import { DESKTOP_READY, runOnlyIn, waitForHydration } from "./helpers";

/** A code no other run has used: E2E-<base36 time>. */
const uniqueCode = () => `E2E-${Date.now().toString(36).toUpperCase()}`;

test.beforeEach(({}, testInfo) => {
  test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop screens");
});

test.describe("D9 as Kinh doanh", () => {
  test.use({ storageState: statePath("SALES") });

  test("adds an item and finds it in the list", async ({ page }) => {
    const code = uniqueCode();
    await page.goto("/catalog/items");
    await waitForHydration(page, DESKTOP_READY);
    await page.getByRole("button", { name: "Thêm vật tư" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Mã hàng").fill(code.toLowerCase());
    await sheet.getByLabel("Tên vật tư").fill(`Khung thử ${code}`);
    await sheet.getByLabel("Trọng lượng chuẩn (kg / cái)").fill("13,5");
    await sheet.getByLabel("Trọng lượng chuẩn (kg / cái)").press("Tab");
    await sheet.getByLabel("Giá thuê / ngày (₫/cái)").fill("1200");
    await expect(sheet.getByText(/Giá thuê \/ tháng: 36\.000 ₫/)).toBeVisible();
    await sheet.getByRole("button", { name: "Thêm vật tư" }).click();
    await expect(sheet).toBeHidden();

    await page
      .getByRole("searchbox", { name: "Tìm vật tư" })
      .fill(code.toLowerCase());
    await page.getByRole("button", { name: "Tìm" }).click();
    const row = page.getByRole("row", { name: new RegExp(code) });
    await expect(row).toContainText("13,5 kg");
    await expect(row).toContainText("1.200 ₫");
  });

  test("shows which kits an item belongs to", async ({ page }) => {
    await page.goto("/catalog/items?item=GG-K17");
    const panel = page.getByRole("region", { name: "Thuộc bộ" });
    await expect(panel).toContainText("Bộ giàn giáo 1,7m");
    await expect(panel).toContainText("43,6 kg");
    await expect(panel).toContainText("3.900 ₫");
  });

  test("creates a kit and sees its totals", async ({ page }) => {
    const code = uniqueCode();
    await page.goto("/catalog/kits");
    await waitForHydration(page, DESKTOP_READY);
    await page.getByRole("button", { name: "Thêm bộ" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Mã bộ").fill(code);
    await dialog.getByLabel("Tên bộ").fill(`Bộ thử ${code}`);
    await dialog
      .getByLabel("Linh kiện 1", { exact: true })
      .selectOption({ label: "GG-K17 · Khung giàn giáo 1,7m" });
    await dialog.getByRole("button", { name: "Thêm linh kiện" }).click();
    await dialog
      .getByLabel("Linh kiện 2", { exact: true })
      .selectOption({ label: "GG-CH · Chéo giàn giáo" });
    await expect(dialog).toContainText("16,3 kg");
    await dialog.getByRole("button", { name: "Thêm bộ" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`Bộ thử ${code}`)).toBeVisible();
  });

  test("adds a site from the customer", async ({ page }) => {
    const name = `Công trình thử ${uniqueCode()}`;
    await page.goto("/catalog/partners?tab=customers");
    await page.getByRole("link", { name: /Minh Phát/ }).click();
    await expect(
      page
        .getByRole("region", { name: "Chi tiết" })
        .getByRole("heading", { level: 2 }),
    ).toHaveText("Cty TNHH Xây dựng Minh Phát");
    await page.getByRole("button", { name: "Thêm công trình" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByLabel("Nhà thầu")).toBeDisabled();
    await sheet.getByLabel("Tên công trình").fill(name);
    await sheet.getByLabel("Tìm tỉnh/thành").fill("ha noi");
    await sheet.getByLabel("Tỉnh/thành", { exact: true }).selectOption("HN");
    await sheet.getByRole("button", { name: "Thêm công trình" }).click();
    await expect(sheet).toBeHidden();
    await expect(
      page.getByRole("region", { name: "Công trình" }),
    ).toContainText(name);
  });
});

test.describe("catalog-extensions as Giám đốc", () => {
  test.use({ storageState: statePath("DIRECTOR") });

  test("adds a metre item with an old code and finds it by that code", async ({
    page,
  }) => {
    const suffix = Date.now().toString(36).toUpperCase();
    const code = `E2E-NỐI 34-${suffix}`;
    const oldCode = `CU-${suffix}`;
    await page.goto("/catalog/items");
    await waitForHydration(page, DESKTOP_READY);
    await page.getByRole("button", { name: "Thêm vật tư" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Mã hàng").fill(code.toLowerCase());
    await sheet.getByLabel("Tên vật tư").fill(`Ống nối thử ${suffix}`);
    await sheet.getByLabel("Mã cũ").fill(oldCode.toLowerCase());
    await sheet.getByRole("button", { name: "Thêm", exact: true }).click();
    await sheet.getByLabel("Đơn vị tính").selectOption("METER");
    await sheet.getByLabel("Trọng lượng chuẩn (kg / m)").fill("3,56");
    await sheet.getByLabel("Trọng lượng chuẩn (kg / m)").press("Tab");
    await sheet.getByLabel("Giá thuê / ngày (₫/m)").fill("150");
    await sheet.getByRole("button", { name: "Thêm vật tư" }).click();
    await expect(sheet).toBeHidden();

    await page
      .getByRole("searchbox", { name: "Tìm vật tư" })
      .fill(oldCode.toLowerCase());
    await page.getByRole("button", { name: "Tìm" }).click();
    const row = page
      .getByRole("row", { name: new RegExp(suffix) })
      .filter({ visible: true });
    await expect(row).toContainText(code);
    await expect(row).toContainText(`Mã cũ: ${oldCode}`);
    await expect(row).toContainText("150 ₫/m");
    await expect(row).toContainText("4.500 ₫/m");
  });

  test("opens the stock card of a code with a plus sign", async ({ page }) => {
    await page.goto(`/inventory/items/${encodeURIComponent("KB+KU34")}`);
    await expect(page.getByText(/KB\+KU34 · đơn vị cái/)).toBeVisible();
  });

  test("filters raw materials in D9", async ({ page }) => {
    await page.goto("/catalog/items");
    await waitForHydration(page, DESKTOP_READY);
    await page
      .getByRole("search")
      .getByRole("button", { name: "Vật tư", exact: true })
      .click();
    await expect(page).toHaveURL(/category=MATERIAL/);
    await expect(
      page.getByRole("row", { name: /QH-2,5/ }).filter({ visible: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("row", { name: /GG-K17/ }).filter({ visible: true }),
    ).toHaveCount(0);
  });

  test("adds a site in TP. Hồ Chí Minh and finds it under Miền Nam", async ({
    page,
  }) => {
    const name = `Công trình thử ${uniqueCode()}`;
    await page.goto("/catalog/partners?tab=customers&q=minh+phat");
    await waitForHydration(page, DESKTOP_READY);
    await page.getByRole("button", { name: "Thêm công trình" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Tên công trình").fill(name);
    await sheet.getByLabel("Tìm tỉnh/thành").fill("ho chi minh");
    await sheet
      .getByLabel("Tỉnh/thành", { exact: true })
      .selectOption({ label: "TP. Hồ Chí Minh" });
    await sheet.getByRole("button", { name: "Thêm công trình" }).click();
    await expect(sheet).toBeHidden();

    await page.goto("/catalog/partners?tab=sites");
    await waitForHydration(page, DESKTOP_READY);
    await page.getByLabel("Khu vực").selectOption("SOUTH");
    await expect(page).toHaveURL(/region=SOUTH/);
    const list = page.getByRole("region", { name: "Danh sách" });
    await expect(list).toContainText(name);
    await expect(list).toContainText("TP. Hồ Chí Minh · Miền Nam");
    await expect(list).not.toContainText("Chung cư An Phú");
  });

  test("puts a person in charge of a customer and filters by them", async ({
    page,
  }) => {
    await page.goto("/catalog/partners?tab=customers&q=hung");
    await waitForHydration(page, DESKTOP_READY);
    await page.getByRole("link", { name: /Trần Văn Hùng/ }).click();
    await page.getByRole("button", { name: "Sửa thông tin" }).click();
    const sheet = page.getByRole("dialog");
    const picker = sheet.getByLabel("Nhân viên phụ trách");
    await picker.selectOption({ index: 1 });
    const person = (
      await picker.locator("option:checked").textContent()
    )?.trim();
    await sheet.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("region", { name: "Chi tiết" })).toContainText(
      person ?? "",
    );

    await page.goto("/catalog/partners?tab=customers");
    await waitForHydration(page, DESKTOP_READY);
    await page
      .getByLabel("Nhân viên phụ trách")
      .selectOption({ label: person ?? "" });
    await expect(page).toHaveURL(/sales=/);
    const list = page.getByRole("region", { name: "Danh sách" });
    await expect(list).toContainText("Trần Văn Hùng");
    await page
      .getByLabel("Nhân viên phụ trách")
      .selectOption({ label: "Chưa có người phụ trách" });
    await expect(page).toHaveURL(/sales=none/);
    await expect(list).not.toContainText("Trần Văn Hùng");
  });
});

test.describe("as Kế toán", () => {
  test.use({ storageState: statePath("ACCOUNTANT") });

  test("reads D9 without edit buttons", async ({ page }) => {
    await page.goto("/catalog/items");
    await expect(
      page.getByRole("heading", { name: "Danh mục vật tư" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Thêm vật tư" })).toHaveCount(
      0,
    );
  });

  test("changes a customer's payment term", async ({ page }) => {
    const days = String(20 + (Date.now() % 40));
    await page.goto("/catalog/partners?tab=customers");
    await waitForHydration(page, DESKTOP_READY);
    await page.getByRole("link", { name: /Minh Phát/ }).click();
    await expect(
      page
        .getByRole("region", { name: "Chi tiết" })
        .getByRole("heading", { level: 2 }),
    ).toHaveText("Cty TNHH Xây dựng Minh Phát");
    await page.getByRole("button", { name: "Sửa thông tin" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Hạn thanh toán mặc định (ngày)").fill(days);
    await sheet.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("region", { name: "Chi tiết" })).toContainText(
      `${days} ngày`,
    );
  });
});
