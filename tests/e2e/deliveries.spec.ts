// D6 and M5 flow (deliveries tasks 7.2): the office plans a batch of
// E2E-KHO-01 on the E2E rental (customer part "E2EXUAT", made once by
// global setup), the storekeeper picks short on the phone and confirms the
// truck leaving, then D6 counts what reached the site. The ledger cannot be
// emptied, so every check is a difference from before the run.
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
    data: { rows: { id: string; code: string }[] };
  };
  const [row] = body.data.rows;
  if (!row) throw new Error("no E2E delivery contract (global setup)");
  return row.id;
}

/** "Đang ở công trình" and "Còn phải giao" of the item on D6, as numbers. */
async function d6Numbers(page: Page, id: string) {
  await page.goto(`/sales/contracts/${id}/deliveries`);
  await waitForHydration(page, DESKTOP_READY);
  const number = (text: string | null) =>
    Number((text ?? "0").replace(/[^\d]/g, ""));
  const site = page
    .getByRole("region", { name: "Hàng đang ở công trình" })
    .getByRole("row")
    .filter({ hasText: ITEM })
    .filter({ visible: true });
  const left = page
    .getByRole("region", { name: "Còn phải giao" })
    .getByRole("row")
    .filter({ hasText: ITEM })
    .filter({ visible: true });
  return {
    onSite: number(await site.getByRole("cell").nth(2).textContent()),
    remaining: number(await left.getByRole("cell").nth(2).textContent()),
  };
}

async function asStorekeeper(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    storageState: statePath("WAREHOUSE"),
    viewport: { width: 390, height: 844 },
  });
  return context.newPage();
}

test.describe("deliveries", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "one flow is enough");
  });
  test.use({ storageState: statePath("SALES") });

  test("plans a batch, picks it short on the phone, D6 counts the site", async ({
    page,
    browser,
  }) => {
    const id = await contractId(page);
    const before = await d6Numbers(page, id);

    // The office: one line of 5 pieces.
    await page.getByRole("button", { name: "Tạo đợt xuất" }).click();
    const dialog = page.getByRole("dialog");
    const removeButtons = dialog.getByRole("button", { name: /^Bỏ / });
    while ((await removeButtons.count()) > 0) {
      await removeButtons.first().click();
    }
    const add = dialog.getByLabel("Thêm mã hàng", { exact: true });
    const value = await add
      .locator("option", { hasText: ITEM })
      .first()
      .getAttribute("value");
    await add.selectOption(value ?? "");
    await dialog.getByRole("button", { name: "Thêm mã" }).click();
    await dialog.getByLabel(`Số lượng ${ITEM}`).fill("5");
    await dialog.getByRole("button", { name: "Lưu và gửi thủ kho" }).click();
    await page.waitForURL(/\/sales\/deliveries\/PX-/);
    const code = decodeURIComponent(page.url().split("/").at(-1) ?? "");
    await expect(
      page.getByText("Chờ nhặt").filter({ visible: true }).first(),
    ).toBeVisible();

    // The storekeeper: start, pick 3 of 5, confirm the truck leaving.
    const phone = await asStorekeeper(browser);
    await phone.goto(`/m/deliveries/${code}`);
    await waitForHydration(phone, MOBILE_READY);
    await phone.getByRole("button", { name: "Bắt đầu nhặt" }).click();
    const card = phone.getByRole("article", { name: ITEM });
    await expect(card.getByRole("button", { name: "Nhặt đủ" })).toBeEnabled();
    for (let i = 0; i < 3; i += 1) {
      await card.getByRole("button", { name: "Tăng" }).first().click();
    }
    await phone.getByLabel("Biển số xe chở hàng").fill("51X-000.01");
    await phone.getByRole("button", { name: "Xác nhận xe rời bãi" }).click();
    await expect(
      phone.getByText(
        "Còn 2 cái chưa nhặt. Xác nhận luôn thì phần thiếu chuyển sang đợt sau.",
      ),
    ).toBeVisible();
    await phone.getByRole("button", { name: "Vẫn xác nhận" }).click();
    await phone.waitForURL(/\/m$/);
    await phone.context().close();

    // D6: 3 more on site, 3 fewer left (the 2 short stay to deliver).
    const after = await d6Numbers(page, id);
    expect(after.onSite - before.onSite).toBe(3);
    expect(before.remaining - after.remaining).toBe(3);
    await expect(
      page.getByText("Đang thực hiện").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(`${code} · Đợt`).filter({ visible: true }),
    ).toBeVisible();
  });

  test("lets the accountant read D6 without planning a batch", async ({
    page,
    browser,
  }) => {
    const id = await contractId(page);
    const context = await browser.newContext({
      storageState: statePath("ACCOUNTANT"),
    });
    const accountant = await context.newPage();
    await accountant.goto(`/sales/contracts/${id}/deliveries`);
    await waitForHydration(accountant, DESKTOP_READY);
    await expect(
      accountant.getByRole("button", { name: "Tạo đợt xuất" }),
    ).toHaveCount(0);
    await context.close();
  });
});
