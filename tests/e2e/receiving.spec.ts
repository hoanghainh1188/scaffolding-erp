// Goods receipts on the phone (goods-receipt task 10.3). Orders carry the
// note "E2E thử" and go to the fixed items E2E-KHO-01/02; the ledger cannot
// be emptied, so stock is checked by difference. Lines go into Chờ sửa and
// Phế liệu, which inventory.spec.ts never reads (it runs in parallel).
import { eq } from "drizzle-orm";
import { expect, test, type Page } from "@playwright/test";

import { createDatabase } from "@/db/client";
import { goodsReceipt, item, purchaseOrder, supplier, user } from "@/db/schema";
import { toBusinessDate } from "@/domain/business-date";
import { getEnv } from "@/lib/env";
import { createOrder } from "@/lib/purchasing/orders";

import { statePath } from "./auth-helpers";
import { E2E_ORDER_NOTE } from "./global-setup";
import { MOBILE_READY, runOnlyIn, waitForHydration } from "./helpers";

test.use({ storageState: statePath("WAREHOUSE") });
test.beforeEach(({}, testInfo) => {
  test.skip(!runOnlyIn(testInfo, "mobile-375"), "phone screens");
});

/** An order of `pieces` per item, placed by e2e.kinhdoanh through the service. */
async function placeOrder(pieces: number[]): Promise<string> {
  const handle = createDatabase(getEnv().DATABASE_URL);
  try {
    const db = handle.db;
    const [sales] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.username, "e2e.kinhdoanh"));
    const [seller] = await db
      .select({ id: supplier.id })
      .from(supplier)
      .where(eq(supplier.name, "Cty TNHH Thép Hòa Phát Hà Nội"));
    const items = await db.select({ id: item.id, code: item.code }).from(item);
    const id = (code: string) => items.find((row) => row.code === code)?.id;
    const created = await createOrder(
      db,
      { id: sales?.id ?? "" },
      {
        supplierId: seller?.id,
        kind: "USED",
        expectedDate: toBusinessDate(new Date()),
        vehicle: "29H-999.99",
        note: E2E_ORDER_NOTE,
        allocationMethod: "VALUE",
        lines: pieces.map((count, index) => ({
          itemId: id(`E2E-KHO-0${index + 1}`),
          unit: "PIECE",
          quantity: String(count),
          unitPrice: 100_000,
        })),
        costs: [{ label: "Cước xe tải", amount: 500_000 }],
      },
      { place: true },
    );
    if (!created.ok) throw new Error(created.error);
    return created.data.code;
  } finally {
    await handle.close();
  }
}

async function receiptsOf(code: string): Promise<string[]> {
  const handle = createDatabase(getEnv().DATABASE_URL);
  try {
    const rows = await handle.db
      .select({ code: goodsReceipt.code, draft: goodsReceipt.clientDraftId })
      .from(goodsReceipt)
      .innerJoin(purchaseOrder, eq(purchaseOrder.id, goodsReceipt.orderId))
      .where(eq(purchaseOrder.code, code));
    return rows.map((row) => row.code);
  } finally {
    await handle.close();
  }
}

/** Chờ sửa at the yard, in pieces. */
async function needsRepair(page: Page, code: string): Promise<number> {
  const response = await page.request.get(`/api/stock/lookup?code=${code}`);
  const json = (await response.json()) as {
    data: { yard: { NEEDS_REPAIR: number } };
  };
  return json.data.yard.NEEDS_REPAIR / 1000;
}

async function openHome(page: Page) {
  await page.goto("/m");
  await waitForHydration(page, MOBILE_READY);
}

const card = (page: Page, name: string) =>
  page.getByRole("region", { name }).filter({ visible: true });

/** Counts a line; `recount` when it is already in "Đã đếm". */
async function count(
  page: Page,
  name: string,
  total: string,
  split: string[],
  recount = false,
) {
  const box = card(page, name);
  if (!recount) {
    await box.getByRole("button", { name: "Đếm", exact: true }).click();
  }
  const field = box.getByLabel(`Thực nhận ${name}`);
  await field.fill(total);
  await field.press("Enter");
  for (const [label, value] of [
    ["Tốt", split[0]],
    ["Chờ sửa", split[1]],
    ["Phế liệu", split[2]],
  ] as const) {
    const input = box.getByLabel(label, { exact: true });
    await input.fill(value ?? "0");
    await input.press("Enter");
  }
}

test("receives an order in two trips; the office sees both on D3b", async ({
  page,
  browser,
}) => {
  const code = await placeOrder([12, 5]);
  const before = await needsRepair(page, "E2E-KHO-01");

  await openHome(page);
  await page.getByRole("link", { name: `Bắt đầu nhập hàng ${code}` }).click();
  await expect(page.getByText("Chuyến 1 · 0/2 mã xong")).toBeVisible();
  await expect(page.getByText("500.000 ₫").first()).toBeVisible();

  // A stray zero is asked about before anything is posted (design D5b).
  await count(page, "Vật tư kho thử 1", "100", ["0", "98", "2"]);
  await card(page, "Vật tư kho thử 2")
    .getByRole("button", { name: "Chuyến này không có" })
    .click();
  await page.getByRole("button", { name: "Xác nhận nhập kho" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(
    "Nhận 100 cái, đơn chỉ còn 12. Đúng không?",
  );
  await dialog.getByRole("button", { name: "Sửa lại" }).click();
  await count(page, "Vật tư kho thử 1", "10", ["0", "8", "2"], true);
  await page.getByRole("button", { name: "Xác nhận nhập kho" }).click();

  await expect(page).toHaveURL(/\/m\/receipts\/PN-\d{4}-\d+\?posted=1/);
  await expect(
    page
      .getByText(/Đã nhập kho PN-/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  expect(await needsRepair(page, "E2E-KHO-01")).toBe(before + 8);

  // Trip 2: only the awaited line is left; Khung-like line 1 closed short.
  await openHome(page);
  await expect(
    page.getByRole("article", { name: code }).filter({ visible: true }),
  ).toContainText("Đang nhận · chờ giao bù 5 vật tư kho thử 2");
  await page.getByRole("link", { name: `Bắt đầu nhập hàng ${code}` }).click();
  await expect(page.getByText("Chuyến 2 · 0/1 mã xong")).toBeVisible();
  await count(page, "Vật tư kho thử 2", "5", ["0", "5", "0"]);
  await page.getByRole("button", { name: "Xác nhận nhập kho" }).click();
  await expect(page).toHaveURL(/\/m\/receipts\/PN-/);
  expect(await receiptsOf(code)).toHaveLength(2);

  const office = await browser.newContext({
    storageState: statePath("SALES"),
    viewport: { width: 1280, height: 720 },
  });
  const desk = await office.newPage();
  await desk.goto(`/purchasing/orders/${code}`);
  await expect(
    desk.getByText("2 chuyến đã nhập", { exact: false }).first(),
  ).toBeVisible();
  // 10 + 5 pieces × 100.000 ₫; the 500.000 ₫ freight is not owed to the seller.
  await expect(
    desk.getByRole("region", { name: "Phải trả người bán" }),
  ).toContainText("1.500.000 ₫");
  await expect(desk.getByText("Hoàn thành").first()).toBeVisible();
  await office.close();
});

test("a receipt confirmed offline is sent once when the network is back", async ({
  page,
  context,
}) => {
  const code = await placeOrder([3]);
  await page.goto(`/m/receive/${code}`);
  await waitForHydration(page, MOBILE_READY);
  // Phế liệu: the two-trip test reads Chờ sửa of the same item meanwhile.
  await count(page, "Vật tư kho thử 1", "3", ["0", "0", "3"]);

  await context.setOffline(true);
  await page.getByRole("button", { name: "Xác nhận nhập kho" }).click();
  await expect(
    page.getByText("Chưa gửi được, sẽ tự gửi khi có mạng").first(),
  ).toBeVisible();
  await expect(page.getByText("Mất kết nối – đã lưu nháp")).toBeVisible();
  expect(await receiptsOf(code)).toEqual([]);

  await context.setOffline(false);
  await expect(page.getByText(/Đã nhập kho PN-\d{4}-\d+/).first()).toBeVisible({
    timeout: 20_000,
  });
  expect(await receiptsOf(code)).toHaveLength(1);

  await page.goto("/m/history");
  await waitForHydration(page, MOBILE_READY);
  await expect(page.getByText("Chưa gửi · lưu trên máy này")).toBeHidden();
});

test("M2 looks up an item by its typed code", async ({ page }) => {
  await page.goto("/m/scan");
  await waitForHydration(page, MOBILE_READY);
  await page.getByLabel("Không quét được? Nhập mã").fill("gg-k17");
  await page.getByRole("button", { name: "Tìm" }).click();
  const found = page.getByRole("region", { name: "Khung giàn giáo 1,7m" });
  await expect(found).toContainText("GG-K17 · cái · 13,5 kg/cái");
  await expect(found.getByRole("link", { name: "Xem thẻ kho" })).toHaveCount(0);
});
