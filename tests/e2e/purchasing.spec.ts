// D2, D3, D3b flows (purchase-orders task 6.2). Orders carry the note
// "E2E thử"; global setup deletes them before each run (design D13). They
// go to Hòa Phát, so the D2 screenshot (Chú Ba only) never shows them.
import { expect, test, type Page } from "@playwright/test";

import { statePath } from "./auth-helpers";
import {
  DESKTOP_READY,
  expectNoHorizontalScroll,
  runOnlyIn,
  waitForHydration,
} from "./helpers";

const desktopOnly = () =>
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop screens");
  });

async function open(page: Page, path: string) {
  await page.goto(path);
  await waitForHydration(page, DESKTOP_READY);
}

/** Fills one D3 line; `row` is 1-based. */
async function fillLine(
  page: Page,
  row: number,
  values: { item: string; kg?: boolean; quantity: string; price: string },
) {
  await page
    .getByRole("combobox", { name: `Mã hàng dòng ${row}` })
    .selectOption({ label: values.item });
  const line = page
    .getByRole("combobox", { name: `Mã hàng dòng ${row}` })
    .locator("xpath=ancestor::tr");
  if (values.kg) await line.getByRole("button", { name: "kg" }).click();
  await line.getByLabel(/^Số lượng/).fill(values.quantity);
  await line.getByLabel(/^Đơn giá/).fill(values.price);
  return line;
}

async function newOrder(page: Page) {
  await open(page, "/purchasing/orders/new");
  const supplier = page.getByLabel("Nhà cung cấp / cai thầu");
  const value = await supplier
    .locator("option", { hasText: "Thép Hòa Phát" })
    .getAttribute("value");
  await supplier.selectOption(value ?? "");
  await page.getByLabel("Ngày dự kiến nhập").fill("15/01/2030");
  await page.getByLabel("Ghi chú").fill("E2E thử");
  const frames = await fillLine(page, 1, {
    item: "GG-K17 · Khung giàn giáo 1,7m",
    quantity: "200",
    price: "185000",
  });
  await page.getByRole("button", { name: "Thêm dòng hàng" }).click();
  await fillLine(page, 2, {
    item: "PL-SAT · Phế liệu sắt lẫn",
    quantity: "1250,5",
    price: "7500",
  });
  await page.getByLabel("Số tiền Cước xe tải").fill("3500000");
  await page.getByLabel("Số tiền Bốc xếp").fill("1200000");
  return frames;
}

const codeOf = (page: Page) =>
  page.url().replace(/.*\/orders\/(PO-\d{4}-\d+).*/, "$1");

test.describe("as Kinh doanh", () => {
  desktopOnly();
  test.use({ storageState: statePath("SALES") });

  test("creates, edits and cancels an order", async ({ page }) => {
    const frames = await newOrder(page);
    // 4.700.000 ₫ by value over 37.000.000 + 9.378.750 ₫.
    await expect(frames.getByText("+3.749.562")).toBeVisible();
    await expect(page.getByTestId("order-total")).toHaveText("51.078.750 ₫");
    await page.getByRole("button", { name: "Lưu đơn" }).click();

    await expect(page).toHaveURL(/\/purchasing\/orders\/PO-\d{4}-\d+\?saved/);
    const code = codeOf(page);
    await expect(
      page
        .getByText(/Lưu xong, đơn hiện ở mục "Xe sắp về"/)
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Chờ xe về").filter({ visible: true }).first(),
    ).toBeVisible();

    await open(page, `/purchasing?tab=waiting&q=${code.toLowerCase()}`);
    await expect(page.getByRole("link", { name: code })).toBeVisible();

    await open(page, `/purchasing/orders/${code}/edit`);
    const line = page
      .getByRole("combobox", { name: "Mã hàng dòng 1" })
      .locator("xpath=ancestor::tr");
    await line.getByLabel(/^Đơn giá/).fill("188000");
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(page).toHaveURL(new RegExp(`/purchasing/orders/${code}$`));
    await expect(
      page.getByText("188.000 ₫").filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/sửa đơn/).filter({ visible: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Hủy đơn" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Lý do hủy").fill("Người bán bán cho chỗ khác");
    await dialog.getByRole("button", { name: "Hủy đơn" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText("Đã hủy: Người bán bán cho chỗ khác").filter({
        visible: true,
      }),
    ).toBeVisible();
  });

  test("saves a draft and deletes it", async ({ page }) => {
    await newOrder(page);
    await page.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(page).toHaveURL(/\/purchasing\/orders\/PO-\d{4}-\d+$/);
    const code = codeOf(page);
    await page.getByRole("button", { name: "Xóa nháp" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Xóa" })
      .click();
    await expect(page).toHaveURL(/\/purchasing$/);
    await open(page, `/purchasing?q=${code.toLowerCase()}`);
    await expect(
      page.getByText("Không có đơn nào khớp bộ lọc").filter({ visible: true }),
    ).toBeVisible();
  });

  test("shows the weight split before saving", async ({ page }) => {
    const frames = await newOrder(page);
    await page.getByText("Theo trọng lượng").click();
    // 2.700 kg of frames and 1.250,5 kg of scrap share 4.700.000 ₫.
    await expect(frames.getByText("+3.212.252")).toBeVisible();
  });
});

test.describe("as Kế toán", () => {
  desktopOnly();
  test.use({ storageState: statePath("ACCOUNTANT") });

  test("reads orders without any write button", async ({ page }) => {
    await open(page, "/purchasing");
    await expect(
      page.getByRole("heading", { level: 1, name: "Đơn thu mua" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Tạo đơn thu mua" }),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: /^PO-\d{4}-\d+$/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Đặt và thực nhận" }),
    ).toBeVisible();
    for (const name of ["Sửa", "Hủy đơn", "Đặt đơn", "Xóa nháp"]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
        0,
      );
      await expect(page.getByRole("link", { name, exact: true })).toHaveCount(
        0,
      );
    }
  });
});

test("D3 at 1366px shows every column of the lines with room to spare", async ({
  page,
}, testInfo) => {
  test.skip(!runOnlyIn(testInfo, "desktop-1366"), "the 1366px screen");
  await open(
    page,
    `/purchasing/orders/PO-${new Date().getFullYear()}-001/edit`,
  );
  const table = page
    .getByRole("region", { name: "Hàng hóa" })
    .getByRole("table");
  for (const name of ["Chi phí phân bổ", "Giá nhập / đơn vị"]) {
    await expect(page.getByRole("columnheader", { name })).toBeInViewport({
      ratio: 1,
    });
  }
  const frame = await table.evaluate((element) => {
    const parent = element.parentElement as HTMLElement;
    return { content: parent.scrollWidth, shown: parent.clientWidth };
  });
  expect(frame.content).toBeLessThanOrEqual(frame.shown);
  // Fonts differ by a pixel or two between macOS and the Linux CI.
  const narrowest = await table.evaluate((element) => {
    const min = element.style.minWidth;
    element.style.minWidth = "0";
    element.style.width = "min-content";
    const width = element.scrollWidth;
    element.style.width = "";
    element.style.minWidth = min;
    return width;
  });
  expect(narrowest).toBeLessThanOrEqual(frame.shown - 24);
  await expectNoHorizontalScroll(page);
});

test("D2 and D3 at 1366px do not scroll sideways", async ({
  page,
}, testInfo) => {
  test.skip(!runOnlyIn(testInfo, "desktop-1366"), "the 1366px screen");
  for (const path of ["/purchasing", "/purchasing/orders/new"]) {
    await open(page, path);
    await expectNoHorizontalScroll(page);
  }
});
