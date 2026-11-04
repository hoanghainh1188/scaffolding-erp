// M4, D6 and D8 flow (returns-and-compensation tasks 7.2): the storekeeper
// takes E2E-KHO-01 back from the E2E rental (customer part "E2EXUAT", kept
// stocked by global setup) with a photo, D6 counts it, the director approves
// the compensation note with a discount, and the accountant only reads D8.
// The ledger cannot be emptied, so every check is a difference.
import sharp from "sharp";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { statePath } from "./auth-helpers";
import {
  DESKTOP_READY,
  MOBILE_READY,
  runOnlyIn,
  waitForHydration,
} from "./helpers";

const ITEM = "E2E-KHO-01";

async function contractId(page: Page): Promise<string> {
  const response = await page.request.get("/api/contracts?q=E2EXUAT");
  const body = (await response.json()) as {
    data: { rows: { id: string }[] };
  };
  const [row] = body.data.rows;
  if (!row) throw new Error("no E2E delivery contract (global setup)");
  return row.id;
}

/**
 * Đã trả, Mất, Đang ở công trình of the item on D6, as numbers. Read by
 * column name: site-operations adds "Chuyển đến / đi", "Mua lại" when used.
 */
async function d6Numbers(page: Page, id: string) {
  await page.goto(`/sales/contracts/${id}/deliveries`);
  await waitForHydration(page, DESKTOP_READY);
  const table = page
    .getByRole("region", { name: "Hàng đang ở công trình" })
    .filter({ visible: true });
  const headers = (await table.getByRole("columnheader").allTextContents()).map(
    (text) => text.trim(),
  );
  const row = table.getByRole("row").filter({ hasText: ITEM });
  // Cells skip the row header ("Hàng"), the first column header.
  const cell = async (name: string) =>
    Number(
      (
        (await row
          .getByRole("cell")
          .nth(headers.indexOf(name) - 1)
          .textContent()) ?? "0"
      ).replace(/[^\d]/g, ""),
    );
  return {
    returned: await cell("Đã trả"),
    lost: await cell("Mất"),
    onSite: await cell("Đang ở công trình"),
  };
}

async function asStorekeeper(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    storageState: statePath("WAREHOUSE"),
    viewport: { width: 390, height: 844 },
  });
  return context.newPage();
}

/** Types a stepper value and leaves the field, which commits it. */
async function setCount(page: Page, label: string, value: string) {
  const field = page.getByRole("textbox", { name: label });
  await field.fill(value);
  await field.press("Tab");
}

test.describe("returns", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "one flow is enough");
  });

  test("counts a return on M4, D6 follows, the director approves D8", async ({
    page,
    browser,
  }) => {
    const id = await contractId(page);
    const before = await d6Numbers(page, id);

    // The storekeeper: 3 back (2 Tốt, 1 Chờ sửa), 1 lost, one photo.
    const phone = await asStorekeeper(browser);
    await phone.goto(`/m/returns/new?contract=${id}`);
    await waitForHydration(phone, MOBILE_READY);
    await phone
      .getByRole("article", { name: ITEM })
      .getByRole("button", { name: "Đếm" })
      .click();
    await setCount(phone, `${ITEM} tổng trả về`, "3");
    await setCount(phone, `${ITEM} Chờ sửa`, "1");
    // Tốt followed the total (3): one moved to Chờ sửa is one too many.
    await expect(
      phone.getByText("Đã chia 4 cái, nhiều hơn tổng trả về 3 cái"),
    ).toBeVisible();
    await expect(
      phone.getByRole("button", { name: "Lưu phiếu thu hồi" }),
    ).toBeDisabled();
    await setCount(phone, `${ITEM} Tốt`, "2");
    await setCount(phone, `${ITEM} Mất`, "1");
    await expect(phone.getByText("Đã chia đủ 3 cái")).toBeVisible();
    await phone.locator("#camera").setInputFiles({
      name: "khung.jpg",
      mimeType: "image/jpeg",
      buffer: await sharp({
        create: { width: 64, height: 48, channels: 3, background: "#7a8b9c" },
      })
        .jpeg()
        .toBuffer(),
    });
    await expect(
      phone.getByRole("button", { name: "Xóa ảnh 1" }),
    ).toBeVisible();
    await phone.getByLabel("Biển số xe").fill("29C-456.78");
    await phone.getByRole("button", { name: "Lưu phiếu thu hồi" }).click();
    const saved = phone.getByRole("heading", { name: /^Đã lưu PTH-/ });
    await expect(saved).toBeVisible();
    const code = ((await saved.textContent()) ?? "").replace("Đã lưu ", "");
    await phone.context().close();

    // D6: 3 more returned, 1 more lost, 4 fewer on site.
    const after = await d6Numbers(page, id);
    expect(after.returned - before.returned).toBe(3);
    expect(after.lost - before.lost).toBe(1);
    expect(before.onSite - after.onSite).toBe(4);

    // The director: D8 from the return note, approve with a discount.
    await page.goto(`/sales/returns/${code}`);
    await waitForHydration(page, DESKTOP_READY);
    await expect(
      page.getByRole("img", { name: /Ảnh hiện trạng 1/ }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: /^ĐB-/ })
      .filter({ visible: true })
      .click();
    await waitForHydration(page, DESKTOP_READY);
    // 1 Chờ sửa × 20.000 + 1 Mất × 100.000 (contract made by global setup).
    await expect(
      page.getByRole("button", { name: "Duyệt 120.000 ₫" }),
    ).toBeVisible();
    await page.getByLabel("Số tiền giảm").fill("20000");
    await page.getByLabel(/Lý do giảm/).fill("E2E thử giảm trừ");
    await page.getByRole("button", { name: "Duyệt 100.000 ₫" }).click();
    await expect(
      page.getByText("Đã duyệt").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(page.getByLabel("Số tiền đền bù")).toHaveText("100.000 ₫");
  });

  test("lets the accountant read a pending D8 without approving", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: statePath("ACCOUNTANT"),
    });
    const accountant = await context.newPage();
    await accountant.goto("/sales/compensations?status=PENDING");
    await waitForHydration(accountant, DESKTOP_READY);
    await accountant
      .getByRole("link", { name: /^ĐB-/ })
      .filter({ visible: true })
      .first()
      .click();
    await waitForHydration(accountant, DESKTOP_READY);
    await expect(
      accountant.getByRole("heading", { name: "Hàng hỏng và mất" }),
    ).toBeVisible();
    await expect(
      accountant.getByRole("button", { name: "Từ chối" }),
    ).toHaveCount(0);
    await context.close();
  });
});
