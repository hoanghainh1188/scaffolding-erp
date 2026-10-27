// D10, D11 and adjustments (inventory-ledger tasks 6.2). The ledger is
// append-only, so these tests post to the fixed items E2E-KHO-01/02 (global
// setup) and check differences, not absolute stock. They post at 0 ₫ and
// touch only Mới / Tốt, so the D10 cards in the screenshots never move.
import { expect, test, type Browser, type Page } from "@playwright/test";

import { statePath } from "./auth-helpers";
import { DESKTOP_READY, runOnlyIn, waitForHydration } from "./helpers";

async function as(browser: Browser, role: "ACCOUNTANT" | "DIRECTOR") {
  const context = await browser.newContext({ storageState: statePath(role) });
  return context.newPage();
}

/** Yard cell of D10 for an item: 0 Mới, 1 Tốt, 2 Chờ sửa, 3 Phế liệu. */
async function yardStock(page: Page, code: string, column: number) {
  await page.goto(`/inventory?q=${code.toLowerCase()}`);
  await waitForHydration(page, DESKTOP_READY);
  const row = page.getByRole("row", { name: new RegExp(code) });
  const text = await row.locator("td").nth(column).innerText();
  return Number(text.replaceAll(".", ""));
}

async function fillLine(
  page: Page,
  index: number,
  values: {
    type?: string;
    item: string;
    condition?: string;
    toCondition?: string;
    direction?: string;
    quantity: string;
    cost?: string;
  },
) {
  const line = page.getByRole("group", { name: `Dòng ${index}` });
  if (values.type) await line.getByLabel("Kiểu").selectOption(values.type);
  await line.getByLabel("Vật tư").selectOption({ label: values.item });
  if (values.condition) {
    await line
      .getByLabel(/^(Từ tình trạng|Tình trạng)$/)
      .selectOption(values.condition);
  }
  if (values.toCondition) {
    await line.getByLabel("Sang tình trạng").selectOption(values.toCondition);
  }
  if (values.direction) {
    await line.getByLabel("Tăng hay giảm").selectOption(values.direction);
  }
  await line.getByLabel(/^Số lượng/).fill(values.quantity);
  if (values.cost !== undefined) {
    await line.getByLabel(/^Đơn giá/).fill(values.cost);
  }
}

const desktopOnly = () =>
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop screens");
  });

test.describe("flows", () => {
  desktopOnly();

  test("opening balance: Kế toán drafts, Giám đốc approves, D10 and D11 show it", async ({
    browser,
  }) => {
    const accountant = await as(browser, "ACCOUNTANT");
    const before = await yardStock(accountant, "E2E-KHO-01", 0);

    await accountant.goto("/inventory/adjustments");
    await waitForHydration(accountant, DESKTOP_READY);
    await accountant
      .getByRole("button", { name: "Lập phiếu tồn đầu kỳ" })
      .click();
    const sheet = accountant.getByRole("dialog");
    await sheet.getByLabel("Lý do").fill("Số tồn khi bắt đầu dùng phần mềm");
    await fillLine(sheet as unknown as Page, 1, {
      item: "E2E-KHO-01 · Vật tư kho thử 1",
      condition: "Mới",
      quantity: "5",
      cost: "0",
    });
    await sheet.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(accountant).toHaveURL(
      /\/inventory\/adjustments\/[0-9a-f-]{36}$/,
    );
    const url = accountant.url();
    await accountant.getByRole("button", { name: "Gửi duyệt" }).click();
    await expect(accountant.getByText("Chờ duyệt").first()).toBeVisible();
    await expect(
      accountant.getByRole("button", { name: "Duyệt và ghi sổ" }),
    ).toHaveCount(0);

    const director = await as(browser, "DIRECTOR");
    await director.goto(url);
    await waitForHydration(director, DESKTOP_READY);
    await director.getByRole("button", { name: "Duyệt và ghi sổ" }).click();
    await director
      .getByRole("alertdialog")
      .getByRole("button", { name: "Duyệt và ghi sổ" })
      .click();
    await expect(
      director.getByRole("heading", { name: "Dòng đã ghi sổ kho" }),
    ).toBeVisible();

    expect(await yardStock(director, "E2E-KHO-01", 0)).toBe(before + 5);
    await director
      .getByRole("row", { name: /E2E-KHO-01/ })
      .locator("td")
      .nth(0)
      .getByRole("link")
      .click();
    await expect(director).toHaveURL(/condition=NEW&place=yard/);
    await expect(
      director.getByRole("heading", {
        level: 1,
        name: /Thẻ kho · Vật tư kho thử 1/,
      }),
    ).toBeVisible();
    await expect(
      director
        .getByRole("row")
        .filter({ hasText: /TĐK-\d{4}-/ })
        .first(),
    ).toBeVisible();
  });

  test("adjustment: returned, fixed, approved; D11 gets two lines", async ({
    browser,
  }) => {
    const accountant = await as(browser, "ACCOUNTANT");
    const before = await yardStock(accountant, "E2E-KHO-02", 1);

    await accountant.goto("/inventory/adjustments?new=ADJUSTMENT");
    await waitForHydration(accountant, DESKTOP_READY);
    const sheet = accountant.getByRole("dialog");
    await sheet.getByLabel("Lý do").fill("Đếm lại bãi");
    await fillLine(sheet as unknown as Page, 1, {
      item: "E2E-KHO-02 · Vật tư kho thử 2",
      condition: "Tốt",
      direction: "Tăng (thừa)",
      quantity: "3",
      cost: "0",
    });
    await sheet.getByRole("button", { name: "Thêm dòng" }).click();
    await fillLine(sheet as unknown as Page, 2, {
      type: "Tình trạng",
      item: "E2E-KHO-02 · Vật tư kho thử 2",
      condition: "Tốt",
      toCondition: "Mới",
      quantity: "1",
    });
    await sheet.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(accountant).toHaveURL(
      /\/inventory\/adjustments\/[0-9a-f-]{36}$/,
    );
    const url = accountant.url();
    const code = (
      await accountant.getByRole("heading", { level: 1 }).innerText()
    ).replace(/^.*· /, "");
    await accountant.getByRole("button", { name: "Gửi duyệt" }).click();
    await expect(accountant.getByText("Chờ duyệt").first()).toBeVisible();

    // Giám đốc sends it back with a reason.
    const director = await as(browser, "DIRECTOR");
    await director.goto(url);
    await waitForHydration(director, DESKTOP_READY);
    await director.getByRole("button", { name: "Trả lại" }).click();
    const dialog = director.getByRole("dialog");
    await dialog.getByLabel("Lý do trả lại").fill("Ghi rõ ngày đếm");
    await dialog.getByRole("button", { name: "Trả lại" }).click();
    await expect(
      director.getByText("Giám đốc trả lại: Ghi rõ ngày đếm"),
    ).toBeVisible();

    // Kế toán fixes the reason and sends it again.
    await accountant.reload();
    await waitForHydration(accountant, DESKTOP_READY);
    await accountant.getByRole("button", { name: "Sửa" }).click();
    const edit = accountant.getByRole("dialog");
    await edit.getByLabel("Lý do").fill("Đếm lại bãi ngày hôm nay");
    await edit.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(edit).toBeHidden();
    await accountant.getByRole("button", { name: "Gửi duyệt" }).click();
    await expect(accountant.getByText("Chờ duyệt").first()).toBeVisible();

    await director.reload();
    await waitForHydration(director, DESKTOP_READY);
    await director.getByRole("button", { name: "Duyệt và ghi sổ" }).click();
    await director
      .getByRole("alertdialog")
      .getByRole("button", { name: "Duyệt và ghi sổ" })
      .click();
    await expect(
      director.getByRole("heading", { name: "Dòng đã ghi sổ kho" }),
    ).toBeVisible();
    expect(await yardStock(director, "E2E-KHO-02", 1)).toBe(before + 2);

    await director.goto(
      "/inventory/items/E2E-KHO-02?condition=GOOD&place=yard",
    );
    await waitForHydration(director, DESKTOP_READY);
    const lines = director.getByRole("row").filter({ hasText: code });
    await expect(lines).toHaveCount(2);
    await expect(lines.first()).toContainText("Điều chỉnh");
  });
});

test.describe("as Kinh doanh", () => {
  desktopOnly();
  test.use({ storageState: statePath("SALES") });

  test("sees D10 but cannot draft adjustments", async ({ page }) => {
    await page.goto("/inventory");
    await waitForHydration(page, DESKTOP_READY);
    await expect(
      page.getByRole("heading", { level: 1, name: "Tồn kho" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Phiếu điều chỉnh" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Lập phiếu điều chỉnh" }),
    ).toHaveCount(0);
  });
});

test("D10 at 1366px fits every column with room to spare", async ({
  page,
}, testInfo) => {
  test.skip(!runOnlyIn(testInfo, "desktop-1366"), "the 1366px screen");
  await page.goto("/inventory");
  await waitForHydration(page, DESKTOP_READY);
  await expect(
    page.getByRole("columnheader", { name: "Giá trị" }),
  ).toBeInViewport({ ratio: 1 });
  const table = page.getByRole("table");
  const frame = await table.evaluate((element) => {
    const parent = element.parentElement as HTMLElement;
    return { content: parent.scrollWidth, shown: parent.clientWidth };
  });
  expect(frame.content).toBeLessThanOrEqual(frame.shown);
  // Fonts differ by a pixel or two between macOS and the Linux CI.
  const narrowest = await table.evaluate((element) => {
    element.style.width = "min-content";
    const width = element.scrollWidth;
    element.style.width = "";
    return width;
  });
  expect(narrowest).toBeLessThanOrEqual(frame.shown - 24);
});
