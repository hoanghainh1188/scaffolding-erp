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
    await sheet.getByLabel("Trọng lượng chuẩn (kg/cái)").fill("13,5");
    await sheet.getByLabel("Trọng lượng chuẩn (kg/cái)").press("Tab");
    await sheet.getByLabel("Giá thuê / ngày (₫)").fill("1200");
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
    await page.getByRole("button", { name: "Thêm công trình" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByLabel("Nhà thầu")).toBeDisabled();
    await sheet.getByLabel("Tên công trình").fill(name);
    await sheet.getByRole("button", { name: "Thêm công trình" }).click();
    await expect(sheet).toBeHidden();
    await expect(
      page.getByRole("region", { name: "Công trình" }),
    ).toContainText(name);
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
