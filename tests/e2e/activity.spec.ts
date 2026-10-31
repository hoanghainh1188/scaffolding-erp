// D18 Nhật ký thao tác (activity-log tasks 8.3). The log cannot be emptied,
// so checks read the newest rows or compare counts before and after.
import { expect, test, type Page } from "@playwright/test";

import { statePath } from "./auth-helpers";
import { DESKTOP_READY, runOnlyIn, waitForHydration } from "./helpers";

test.beforeEach(({}, testInfo) => {
  test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop screen");
});

/** "Đang hiện N / M thao tác" → M. */
async function totalShown(page: Page): Promise<number> {
  const text = await page
    .getByText(/^Đang hiện [\d.]+ \/ [\d.]+ thao tác$/)
    .filter({ visible: true })
    .textContent();
  return Number((text ?? "").split("/")[1]?.replace(/\D/g, "") ?? NaN);
}

async function editSupplier(page: Page, bankAccount: string) {
  await page.goto("/catalog/partners?tab=suppliers");
  await waitForHydration(page, DESKTOP_READY);
  await page.getByRole("link", { name: /Chú Ba ve chai/ }).click();
  await page.getByRole("button", { name: "Sửa thông tin" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Số tài khoản").fill(bankAccount);
  await sheet.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(sheet).toBeHidden();
}

test.describe("D18 for the director", () => {
  test("a bank account change shows masked, flagged, with before and after", async ({
    page,
  }) => {
    const account = `0451${String(Date.now()).slice(-8)}`;
    await editSupplier(page, account);

    await page.goto("/settings/activity?type=SUPPLIER&group=UPDATE");
    await waitForHydration(page, DESKTOP_READY);
    const row = page
      .getByRole("row")
      .filter({ hasText: "Số tài khoản" })
      .filter({ visible: true })
      .first();
    await expect(row).toContainText(`•••• ${account.slice(-4)}`);
    await expect(row).toContainText("Dữ liệu nhạy cảm");
    await expect(row).not.toContainText(account);
    await row.click();
    const detail = page
      .getByRole("heading", { name: /^Thay đổi trên NCC-/ })
      .filter({ visible: true })
      .locator("..");
    await expect(
      detail.getByRole("rowheader", { name: "Số tài khoản" }),
    ).toBeVisible();
    await expect(detail).toContainText(`•••• ${account.slice(-4)}`);

    // Saving the same values again writes no row.
    const before = await totalShown(page);
    await editSupplier(page, account);
    await page.goto("/settings/activity?type=SUPPLIER&group=UPDATE");
    await waitForHydration(page, DESKTOP_READY);
    expect(await totalShown(page)).toBe(before);
  });

  test("filters what needs a look and exports to Excel", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("link", { name: /Nhật ký thao tác/ }).click();
    await expect(page).toHaveURL(/\/settings\/activity$/);
    await page.goto("/settings/activity?from=2026-10-27&to=2026-10-28");
    await waitForHydration(page, DESKTOP_READY);
    const toggle = page.getByRole("switch", { name: /Chỉ cần xem kỹ/ });
    // The dev database holds the sample twice (dev and e2e accounts).
    const flagged = Number(
      /\((\d+)\)/.exec((await toggle.textContent()) ?? "")?.[1],
    );
    expect(flagged).toBeGreaterThanOrEqual(3);
    await toggle.click();
    await expect(page).toHaveURL(/review=1/);
    const rows = page
      .locator("tbody tr")
      .filter({ has: page.locator("th[scope=row]") })
      .filter({ visible: true });
    await expect(rows).toHaveCount(flagged);
    for (const row of await rows.all()) {
      await expect(row).toContainText(
        /Ngoài giờ|Dữ liệu nhạy cảm|Có xác nhận bất thường/,
      );
    }

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Xuất Excel" }).click();
    expect((await download).suggestedFilename()).toBe(
      "nhat-ky-2026-10-27-2026-10-28.xlsx",
    );
  });
});

test.describe("D18 for the accountant", () => {
  test.use({ storageState: statePath("ACCOUNTANT") });

  test("is refused with 403", async ({ page }) => {
    const response = await page.goto("/settings/activity");
    // Next.js 16 streaming can return 200 before forbidden() takes over the streamed UI
    expect([200, 403]).toContain(response?.status());
    await expect(
      page.getByText("Bạn không có quyền xem trang này").filter({
        visible: true,
      }),
    ).toBeVisible();
    const api = await page.request.get("/api/activity");
    expect(api.status()).toBe(403);
  });
});
