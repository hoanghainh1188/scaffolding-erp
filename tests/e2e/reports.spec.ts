// D15 Báo cáo quản trị (management-reports task 6.2, design D6). Numbers
// on the dev database change with every run and every day, so this checks
// the blocks, the period in the URL, the Excel file and who may open the
// page; the amounts are checked by integration tests. The baseline is in
// visual.spec.ts (January 2020, before any data).
import { expect, test } from "@playwright/test";

import { statePath } from "./auth-helpers";
import { DESKTOP_READY, runOnlyIn, waitForHydration } from "./helpers";

/** This month in Vietnam ("2026-11"), as the server sees it. */
const thisMonth = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })
    .format(new Date())
    .slice(0, 7);

test.describe("reports", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "one flow is enough");
  });

  test("the director reads D15 and switches the period", async ({ page }) => {
    await page.goto("/reports");
    await waitForHydration(page, DESKTOP_READY);
    await expect(
      page
        .getByRole("heading", { level: 1, name: "Báo cáo quản trị" })
        .filter({ visible: true }),
    ).toBeVisible();
    for (const label of [
      "Doanh thu",
      "Lợi nhuận gộp",
      "Hao hụt",
      "Tỷ lệ khai thác",
    ]) {
      await expect(
        page
          .getByText(label, { exact: true })
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
    }
    const table = page
      .getByRole("region", { name: "Lợi nhuận gộp" })
      .filter({ visible: true });
    for (const line of [
      "Doanh thu (chưa VAT)",
      "Giá vốn và hao hụt",
      "Sửa chữa (lỗ hỏng hàng)",
      "Chênh lệch kiểm kê và điều chỉnh",
      "Tỷ suất lợi nhuận gộp",
    ]) {
      await expect(table.getByText(line, { exact: true })).toBeVisible();
    }
    const month = Number(thisMonth().slice(5));
    await expect(
      page
        .getByRole("list", { name: "Doanh thu và lợi nhuận gộp theo tháng" })
        .filter({ visible: true })
        .getByRole("listitem"),
    ).toHaveCount(month);

    await page
      .getByRole("button", { name: "Quý", exact: true })
      .filter({ visible: true })
      .click();
    await expect(page).toHaveURL(/period=quarter&value=\d{4}-Q[1-4]/);

    const ranking = page
      .getByRole("region", { name: /Xếp hạng nhà thầu/ })
      .filter({ visible: true });
    await ranking.getByRole("button", { name: "Theo kg" }).click();
    await expect(
      ranking.getByRole("button", { name: "Theo kg" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("downloads the period as Excel", async ({ page }) => {
    await page.goto(`/reports?period=month&value=${thisMonth()}`);
    await waitForHydration(page, DESKTOP_READY);
    const download = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "Xuất Excel" })
      .filter({ visible: true })
      .click();
    expect((await download).suggestedFilename()).toBe(
      `bao-cao-${thisMonth()}.xlsx`,
    );
  });

  test.describe("as the accountant", () => {
    test.use({ storageState: statePath("ACCOUNTANT") });

    test("finds Báo cáo in the menu", async ({ page }) => {
      await page.goto("/dashboard");
      await waitForHydration(page, DESKTOP_READY);
      await page
        .getByRole("link", { name: "Báo cáo", exact: true })
        .filter({ visible: true })
        .click();
      await expect(page).toHaveURL(/\/reports$/);
      await expect(
        page
          .getByRole("heading", { level: 1, name: "Báo cáo quản trị" })
          .filter({ visible: true }),
      ).toBeVisible();
    });
  });

  test.describe("as sales", () => {
    test.use({ storageState: statePath("SALES") });

    test("is refused the page and the file", async ({ page, request }) => {
      const response = await page.goto("/reports");
      // Streaming may have sent 200 before the guard answered (D14 alike).
      expect([200, 403]).toContain(response?.status());
      await expect(
        page.getByRole("heading", { name: "Bạn không có quyền xem trang này" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Báo cáo", exact: true }),
      ).toHaveCount(0);
      const file = await request.get(
        `/api/reports/export?period=month&value=${thisMonth()}`,
      );
      expect(file.status()).toBe(403);
    });
  });
});
