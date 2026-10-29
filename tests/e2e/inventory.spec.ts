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
  // In order: the value test needs the Mới stock the adjustment test adds.
  test.describe.configure({ mode: "serial" });

  test("opening balance: Kế toán drafts, Giám đốc approves, D10 and D11 show it", async ({
    browser,
  }) => {
    const accountant = await as(browser, "ACCOUNTANT");
    const before = await yardStock(accountant, "E2E-KHO-01", 0);

    await accountant.goto("/inventory/adjustments");
    await waitForHydration(accountant, DESKTOP_READY);
    await accountant.getByRole("button", { name: "Lập phiếu" }).click();
    await accountant.getByRole("menuitem", { name: "Tồn đầu kỳ" }).click();
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

  test("raises then lowers the average by exactly the change ÷ stock", async ({
    browser,
  }) => {
    const accountant = await as(browser, "ACCOUNTANT");
    await accountant.goto(
      "/inventory/items/E2E-KHO-02?condition=NEW&place=yard&from=2026-01-01&to=2030-12-31",
    );
    await waitForHydration(accountant, DESKTOP_READY);
    const source = accountant
      .getByRole("row")
      .filter({ hasText: /(ĐC|TĐK)-\d{4}-\d{3}/ })
      .first();
    test.skip(
      (await source.count()) === 0,
      "E2E-KHO-02 Mới has no stock yet (runs after the adjustment flow)",
    );
    const related =
      /(ĐC|TĐK)-\d{4}-\d{3}/.exec(await source.innerText())?.[0] ?? "";

    // +1.000 ₫ per piece: the change is stock × 1.000, so it divides evenly.
    const up = await valueAdjustment(
      browser,
      related,
      "Tăng giá trị",
      (pool) => pool * 1000,
    );
    expect(up.pool).toBeGreaterThan(0);
    const upLines = up.director.getByRole("row", { name: /E2E-KHO-02/ });
    await expect(upLines.first()).toContainText(money(up.avg + 1000));

    await up.director.goto(
      "/inventory/items/E2E-KHO-02?condition=NEW&place=yard",
    );
    await waitForHydration(up.director, DESKTOP_READY);
    const row = up.director.getByRole("row").filter({ hasText: up.code });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Điều chỉnh giá");
    await expect(row).toContainText(money(up.avg + 1000));

    // Back down by the same amount: the average and D10 value are as before.
    const down = await valueAdjustment(
      browser,
      related,
      "Giảm giá trị",
      (pool) => pool * 1000,
    );
    expect(down.avg).toBe(up.avg + 1000);
    await expect(
      down.director.getByRole("row", { name: /E2E-KHO-02/ }).first(),
    ).toContainText(money(up.avg));
  });
});

/**
 * One value adjustment of E2E-KHO-02 Mới through the screens: Kế toán drafts
 * and submits, Giám đốc approves. Returns the stock and averages it saw.
 */
async function valueAdjustment(
  browser: Browser,
  related: string,
  direction: "Tăng giá trị" | "Giảm giá trị",
  amount: (pool: number) => number,
) {
  const accountant = await as(browser, "ACCOUNTANT");
  await accountant.goto("/inventory/adjustments");
  await waitForHydration(accountant, DESKTOP_READY);
  await accountant.getByRole("button", { name: "Lập phiếu" }).click();
  await accountant
    .getByRole("menuitem", { name: "Điều chỉnh giá trị" })
    .click();
  const sheet = accountant.getByRole("dialog");
  await sheet.getByLabel("Chứng từ bị sửa").fill(related);
  await sheet.getByLabel("Lý do").fill("E2E thử điều chỉnh giá");
  const line = sheet.getByRole("group", { name: "Dòng 1" });
  await line
    .getByLabel("Vật tư")
    .selectOption({ label: "E2E-KHO-02 · Vật tư kho thử 2" });
  await line.getByLabel("Tình trạng").selectOption("Mới");
  await line.getByLabel("Tăng hay giảm").selectOption(direction);
  await line.getByLabel("Chênh lệch (₫)").fill("1000");
  const preview = line.getByText(/^Tồn .* → Giá BQ mới/);
  await expect(preview).toBeVisible();
  const [, poolText = "0", avgText = "0"] =
    /^Tồn ([\d.]+) cái · Giá BQ ([\d.]+) ₫/.exec(await preview.innerText()) ??
    [];
  const pool = Number(poolText.replaceAll(".", ""));
  const avg = Number(avgText.replaceAll(".", ""));
  await line.getByLabel("Chênh lệch (₫)").fill(String(amount(pool)));
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
  return { director, code, pool, avg };
}

const money = (value: number) => `${value.toLocaleString("vi-VN")} ₫`;

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
