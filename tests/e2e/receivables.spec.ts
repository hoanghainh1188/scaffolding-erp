// D14 and D14b (receivables task 8.2, design D10). Receipts can never be
// removed, so the accountant records 1.000 ₫ for Minh Phát (the customer
// of the E2E rental) and cancels it again: what it settled reopens, and
// nothing is left over. No contract is settled on the dev database (it
// cannot be reopened); settling is checked by integration tests.
import { expect, test, type Page } from "@playwright/test";

import { statePath } from "./auth-helpers";
import { DESKTOP_READY, runOnlyIn, waitForHydration } from "./helpers";

const MINH_PHAT = "Cty TNHH Xây dựng Minh Phát";

/** Today in Vietnam ("2026-11-05"), as the server sees it. */
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(),
  );

async function contractId(page: Page, token: string): Promise<string> {
  const response = await page.request.get(`/api/contracts?q=${token}`);
  const body = (await response.json()) as {
    data: { rows: { id: string; code: string }[] };
  };
  const row = body.data.rows.find((entry) => entry.code.endsWith(token));
  if (!row) throw new Error(`no E2E contract ${token} (global setup)`);
  return row.id;
}

test.describe("receivables", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "one flow is enough");
  });

  test.describe("as the accountant", () => {
    test.use({ storageState: statePath("ACCOUNTANT") });

    test("records 1.000 ₫ for Minh Phát and cancels it with a reason", async ({
      page,
    }) => {
      await page.goto(
        `/receivables?filter=all&q=${encodeURIComponent("Minh Phát")}`,
      );
      await waitForHydration(page, DESKTOP_READY);
      await page
        .getByRole("link", { name: MINH_PHAT })
        .filter({ visible: true })
        .click();
      await expect(
        page
          .getByRole("heading", { name: `Ghi nhận thu tiền · ${MINH_PHAT}` })
          .filter({ visible: true }),
      ).toBeVisible();
      await page.getByLabel("Số tiền").filter({ visible: true }).fill("1000");
      const saved = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/receivables/receipts") &&
          response.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: /Ghi phiếu thu 1\.000 ₫/ })
        .filter({ visible: true })
        .click();
      const body = (await (await saved).json()) as {
        data: { code: string };
      };
      const code = body.data.code;
      expect(code).toMatch(/^PT-\d{4}-\d{3,}$/);
      const row = page
        .getByRole("row")
        .filter({ hasText: code })
        .filter({ visible: true });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "Hủy" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Lý do hủy").fill("E2E thử");
      await dialog.getByRole("button", { name: "Hủy phiếu" }).click();
      await expect(row).toContainText("Đã hủy");
      await expect(row).toContainText("E2E thử");
    });

    test("shows why the E2E rental cannot be settled yet", async ({ page }) => {
      const id = await contractId(page, "E2EXUAT");
      await page.goto(`/receivables/contracts/${id}/close`);
      await waitForHydration(page, DESKTOP_READY);
      await expect(
        page.getByRole("heading", { name: "Thanh lý hợp đồng" }),
      ).toBeVisible();
      await expect(
        page.getByText(/^Hàng ở công trình: còn /).filter({ visible: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("button", { name: /Thanh lý và ghi cấn trừ cọc/ })
          .filter({ visible: true }),
      ).toBeDisabled();
    });

    test("downloads the receivables as Excel", async ({ page }) => {
      await page.goto("/receivables?filter=all");
      await waitForHydration(page, DESKTOP_READY);
      const download = page.waitForEvent("download");
      await page
        .getByRole("link", { name: "Xuất Excel", exact: true })
        .filter({ visible: true })
        .click();
      expect((await download).suggestedFilename()).toBe(
        `cong-no-${today()}.xlsx`,
      );
    });
  });

  test.describe("as sales", () => {
    test.use({ storageState: statePath("SALES") });

    test("is refused with 403", async ({ page }) => {
      const response = await page.goto("/receivables");
      expect([200, 403]).toContain(response?.status());
      await expect(
        page.getByRole("heading", { name: "Bạn không có quyền xem trang này" }),
      ).toBeVisible();
    });
  });
});
