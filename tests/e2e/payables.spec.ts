// D14c (payables task 8.2, design D10). Supplier payments can never be
// removed, so the accountant records 1.000 ₫ for the sample steel company
// (the seller of the E2E orders) and cancels it again. receiving.spec.ts
// may post receipts for the same seller meanwhile, so the checks read the
// row of this payment only, never the seller's totals. The days a seller
// lets us owe are not changed on the dev database (integration tests).
import { expect, test } from "@playwright/test";

import { statePath } from "./auth-helpers";
import { DESKTOP_READY, runOnlyIn, waitForHydration } from "./helpers";

const STEEL = "Cty TNHH Thép Hòa Phát Hà Nội";

/** Today in Vietnam ("2026-11-06"), as the server sees it. */
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(),
  );

test.describe("payables", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "one flow is enough");
  });

  test.describe("as the accountant", () => {
    test.use({ storageState: statePath("ACCOUNTANT") });

    test("goes from Phải thu to Phải trả", async ({ page }) => {
      await page.goto("/receivables");
      await waitForHydration(page, DESKTOP_READY);
      await page
        .getByRole("link", { name: "Phải trả", exact: true })
        .filter({ visible: true })
        .click();
      await expect(page).toHaveURL(/\/payables$/);
      await expect(
        page
          .getByRole("heading", { name: "Công nợ phải trả" })
          .filter({ visible: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("link", { name: "Phải trả", exact: true })
          .filter({ visible: true }),
      ).toHaveAttribute("aria-current", "page");
    });

    test("records 1.000 ₫ for the steel company and cancels it", async ({
      page,
    }) => {
      await page.goto(
        `/payables?filter=all&q=${encodeURIComponent("Hòa Phát")}`,
      );
      await waitForHydration(page, DESKTOP_READY);
      await page
        .getByRole("link", { name: STEEL })
        .filter({ visible: true })
        .click();
      await expect(
        page
          .getByRole("heading", { name: `Ghi phiếu chi · ${STEEL}` })
          .filter({ visible: true }),
      ).toBeVisible();
      await page.getByLabel("Số tiền").filter({ visible: true }).fill("1000");
      const saved = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/payables/payments") &&
          response.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: /Ghi phiếu chi 1\.000 ₫/ })
        .filter({ visible: true })
        .click();
      const body = (await (await saved).json()) as { data: { code: string } };
      const code = body.data.code;
      expect(code).toMatch(/^PC-\d{4}-\d{3,}$/);
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

    test("downloads the payables as Excel", async ({ page }) => {
      await page.goto("/payables?filter=all");
      await waitForHydration(page, DESKTOP_READY);
      const download = page.waitForEvent("download");
      await page
        .getByRole("link", { name: "Xuất Excel", exact: true })
        .filter({ visible: true })
        .click();
      expect((await download).suggestedFilename()).toBe(
        `cong-no-phai-tra-${today()}.xlsx`,
      );
    });
  });

  test.describe("as sales", () => {
    test.use({ storageState: statePath("SALES") });

    test("is refused and sees no Phải trả tab", async ({ page }) => {
      const response = await page.goto("/payables");
      expect([200, 403]).toContain(response?.status());
      await expect(
        page.getByRole("heading", { name: "Bạn không có quyền xem trang này" }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Phải trả" })).toHaveCount(0);
    });
  });
});
