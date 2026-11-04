// D7 and the holiday settings (rental-billing tasks 7.2, design D14). A
// closed period can never be removed, so no period is closed here: closing,
// adjustments and their locks are checked by integration tests. The E2E
// rental (E2EXUAT) always has goods on site, so the running month bills it.
import { expect, test, type Page } from "@playwright/test";

import { statePath } from "./auth-helpers";
import { DESKTOP_READY, runOnlyIn, waitForHydration } from "./helpers";

/** The running month in Vietnam ("2026-11"), as the server sees it. */
const thisMonth = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());

async function contractId(page: Page, token: string): Promise<string> {
  const response = await page.request.get(`/api/contracts?q=${token}`);
  const body = (await response.json()) as {
    data: { rows: { id: string; code: string }[] };
  };
  const row = body.data.rows.find((entry) => entry.code.endsWith(token));
  if (!row) throw new Error(`no E2E contract ${token} (global setup)`);
  return row.id;
}

test.describe("rental billing", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "one flow is enough");
  });

  test.describe("as the accountant", () => {
    test.use({ storageState: statePath("ACCOUNTANT") });

    test("bills the running month as an estimate and cannot close it yet", async ({
      page,
    }) => {
      const id = await contractId(page, "E2EXUAT");
      await page.goto(
        `/receivables/billing?month=${thisMonth()}&contract=${id}`,
      );
      await waitForHydration(page, DESKTOP_READY);
      await expect(
        page.getByRole("heading", { name: "Tính tiền thuê" }),
      ).toBeVisible();
      await expect(
        page
          .getByText(/^Tạm tính đến \d{2}\/\d{2}\/\d{4}\. Kỳ chưa hết/)
          .filter({ visible: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("button", { name: /Chốt kỳ và ghi công nợ/ })
          .filter({ visible: true }),
      ).toBeDisabled();
      await expect(
        page.getByText(/chưa hết\. Bạn chốt từ ngày/).filter({ visible: true }),
      ).toBeVisible();
      // The accountant reads holidays but edits them in Settings only as director.
      await expect(
        page.getByRole("link", { name: "Sửa ở Cài đặt → Ngày nghỉ" }),
      ).toHaveCount(0);
    });

    test("downloads the month as Excel", async ({ page }) => {
      await page.goto(`/receivables/billing?month=${thisMonth()}`);
      await waitForHydration(page, DESKTOP_READY);
      const download = page.waitForEvent("download");
      await page
        .getByRole("link", { name: "Xuất Excel" })
        .filter({ visible: true })
        .click();
      expect((await download).suggestedFilename()).toBe(
        `tien-thue-${thisMonth()}.xlsx`,
      );
    });
  });

  test.describe("as sales", () => {
    test.use({ storageState: statePath("SALES") });

    test("opens the rent from D5 and only reads it", async ({ page }) => {
      const id = await contractId(page, "E2EXUAT");
      await page.goto(`/sales/contracts/${id}`);
      await waitForHydration(page, DESKTOP_READY);
      await page
        .getByRole("link", { name: "Tiền thuê theo kỳ" })
        .filter({ visible: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Tính tiền thuê" }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("link", { name: "In bảng kê" })
          .filter({ visible: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Chốt kỳ và ghi công nợ/ }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Thêm dòng điều chỉnh" }),
      ).toHaveCount(0);
    });
  });

  test("the director adds, edits and deletes a holiday", async ({ page }) => {
    await page.goto("/settings/holidays?year=2098");
    await waitForHydration(page, DESKTOP_READY);
    await page.getByRole("button", { name: "Thêm ngày nghỉ" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Tên").fill("Nghỉ E2E");
    await dialog.getByLabel("Từ ngày").fill("10/03/2098");
    await dialog.getByLabel("Đến ngày").fill("11/03/2098");
    await dialog.getByLabel("Đến ngày").press("Tab");
    await dialog.getByRole("button", { name: "Lưu" }).click();
    const row = page.getByRole("row").filter({ hasText: "Nghỉ E2E" });
    await expect(row).toContainText("10/03/2098 – 11/03/2098");

    await page.getByRole("button", { name: "Sửa Nghỉ E2E" }).click();
    await dialog.getByLabel("Đến ngày").fill("12/03/2098");
    await dialog.getByLabel("Đến ngày").press("Tab");
    await dialog.getByRole("button", { name: "Lưu" }).click();
    await expect(row).toContainText("10/03/2098 – 12/03/2098");

    await page.getByRole("button", { name: "Xóa Nghỉ E2E" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xóa" }).click();
    await expect(
      page.getByText("Năm 2098 chưa có ngày nghỉ nào."),
    ).toBeVisible();
  });
});
