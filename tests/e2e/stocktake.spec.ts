// Stocktake from the phone to the director (stocktake task 8.2, design
// D16). The session is at XUONG-01: the seed session keeps BAI-01, and one
// place holds one open session. Only E2E-KHO-02 is counted (repairs.spec.ts
// measures E2E-KHO-01 at the workshop), and only as a surplus; the ledger
// cannot be emptied, so the result is checked against the session.
import { and, eq } from "drizzle-orm";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { createDatabase } from "@/db/client";
import {
  inventoryLedger,
  item,
  location,
  stocktake,
  stocktakeLine,
  user,
} from "@/db/schema";
import type { Condition } from "@/domain/condition";
import { CONDITION_LABELS } from "@/domain/condition";
import type { Role } from "@/domain/role";
import { getEnv } from "@/lib/env";

import { statePath } from "./auth-helpers";
import {
  cancelTestStocktakes,
  E2E_STOCK_ITEMS,
  E2E_STOCKTAKE_PLACE,
} from "./global-setup";

/** The item this spec counts; no other spec reads it at the workshop. */
const COUNTED = E2E_STOCK_ITEMS[1];
import {
  DESKTOP_READY,
  MOBILE_READY,
  runOnlyIn,
  waitForHydration,
} from "./helpers";

// One project for the whole file: both tests start a session at the same
// place, so they must not run side by side, and the snapshot workflow only
// runs desktop-1280. The phone page sets its own phone viewport.
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!runOnlyIn(testInfo, "desktop-1280"), "one flow, one project");
  // A retry starts where the failed try left a session open (global setup
  // runs once per run, not per retry).
  await withDb(async (db) => {
    const [director] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.username, "e2e.giamdoc"));
    if (director) await cancelTestStocktakes(db, director);
  });
  await page.setViewportSize({ width: 375, height: 812 });
});

async function withDb<T>(
  body: (db: ReturnType<typeof createDatabase>["db"]) => Promise<T>,
): Promise<T> {
  const handle = createDatabase(getEnv().DATABASE_URL);
  try {
    return await body(handle.db);
  } finally {
    await handle.close();
  }
}

/** Stock now, the count the test types (book + 1 for Chờ sửa). */
async function stockAt(code: string, condition: Condition): Promise<number> {
  return withDb(async (db) => {
    const rows = await db
      .select({ quantity: inventoryLedger.quantity })
      .from(inventoryLedger)
      .innerJoin(item, eq(item.id, inventoryLedger.itemId))
      .innerJoin(location, eq(location.id, inventoryLedger.locationId))
      .where(
        and(
          eq(item.code, code),
          eq(inventoryLedger.condition, condition),
          eq(location.code, E2E_STOCKTAKE_PLACE),
        ),
      );
    return rows.reduce((sum, row) => sum + Number(row.quantity), 0);
  });
}

async function desk(browser: Browser, role: Role): Promise<Page> {
  const context = await browser.newContext({
    storageState: statePath(role),
    viewport: { width: 1366, height: 900 },
  });
  return context.newPage();
}

const itemName = (code: string) => `Vật tư kho thử ${Number(code.slice(-2))}`;

const CONDITION_BY_LABEL = new Map(
  (Object.entries(CONDITION_LABELS) as [Condition, string][]).map(
    ([condition, label]) => [label, condition],
  ),
);

/**
 * Counts the E2E item on M6: the book for every condition, one more Chờ
 * sửa. The first run adds the item (no stock at the workshop yet); later
 * runs find it listed. In a recount only the line asked for has a box.
 */
async function countItem(page: Page, code: string) {
  const name = itemName(code);
  await page
    .getByRole("searchbox", { name: "Tìm mã hoặc tên hàng" })
    .fill(code);
  const todo = page.getByRole("article", {
    name: new RegExp(`^${name}, chưa đếm`),
  });
  if (await todo.count()) {
    await todo.getByRole("button", { name: "Đếm mã này" }).click();
  } else {
    await page
      .getByRole("button", { name: /Thấy hàng không có trong danh sách/ })
      .click();
    const sheet = page.getByRole("dialog");
    await sheet
      .getByRole("searchbox", { name: "Tìm mã hoặc tên hàng" })
      .fill(code);
    await sheet.getByRole("button", { name: "Tìm", exact: true }).click();
    await sheet.getByRole("button", { name: new RegExp(name) }).click();
  }
  const card = page.getByRole("article", {
    name: new RegExp(`^${name}, đang đếm`),
  });
  await expect(card).toBeVisible();
  const addRepair = card.getByRole("button", { name: "Chờ sửa", exact: true });
  if (await addRepair.count()) await addRepair.click();
  await expect(
    card.getByRole("textbox", {
      name: `Số ${name.toLowerCase()} Chờ sửa đếm được`,
    }),
  ).toBeVisible();
  const boxes = card.getByRole("textbox");
  for (let index = 0; index < (await boxes.count()); index += 1) {
    const box = boxes.nth(index);
    const label = (await box.getAttribute("aria-label")) ?? "";
    const condition = CONDITION_BY_LABEL.get(
      label.replace(`Số ${name.toLowerCase()} `, "").replace(" đếm được", ""),
    );
    if (!condition) throw new Error(`unknown box ${label}`);
    const book = await stockAt(code, condition);
    await box.fill(String(condition === "NEEDS_REPAIR" ? book + 1 : book));
  }
  await card.getByRole("button", { name: "Xong mã này" }).click();
  await expect(
    page.getByRole("article", { name: new RegExp(`^${name}, đã đếm`) }),
  ).toBeVisible();
}

async function sendToOffice(page: Page) {
  await page.getByRole("button", { name: "Gửi văn phòng" }).click();
  const confirm = page.getByRole("alertdialog");
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.getByRole("button", { name: "Gửi luôn" }).click();
  }
  await expect(page.getByText(/Chờ Giám đốc duyệt/)).toBeVisible();
}

test.use({ storageState: statePath("WAREHOUSE") });

test("counts at the workshop, recounts one line, and the director posts it", async ({
  page,
  browser,
}) => {
  // Phone, director and accountant in one flow: longer than one page test.
  test.setTimeout(120_000);
  await page.goto("/m/stocktake/new");
  await waitForHydration(page, MOBILE_READY);
  await page
    .getByRole("radio", { name: new RegExp(`^${E2E_STOCKTAKE_PLACE} · `) })
    .click();
  await page.getByRole("button", { name: /^Bắt đầu đếm \d+ dòng$/ }).click();
  await page.waitForURL(/\/m\/stocktake\/KK-\d{4}-\d{3,}$/);
  const code = page.url().split("/").at(-1) ?? "";
  await waitForHydration(page, MOBILE_READY);
  await expect(page.getByText(/sổ lúc đếm|giá BQ/i)).toHaveCount(0);

  await countItem(page, COUNTED);
  await sendToOffice(page);

  // The director asks Chờ sửa of the item again.
  const director = await desk(browser, "DIRECTOR");
  await director.goto(`/inventory/stocktakes/${code}`);
  await waitForHydration(director, DESKTOP_READY);
  const surplus = director
    .getByRole("row", { name: new RegExp(COUNTED) })
    .filter({
      hasText: "Chờ sửa",
    });
  await expect(surplus).toContainText("+");
  await surplus.getByRole("checkbox").check();
  await director
    .getByRole("button", { name: "Yêu cầu đếm lại 1 dòng" })
    .click();
  await expect(director.getByText("Đang đếm").first()).toBeVisible();

  await page.goto(`/m/stocktake/${code}`);
  await waitForHydration(page, MOBILE_READY);
  await expect(
    page.getByText("Văn phòng yêu cầu đếm lại 1 dòng."),
  ).toBeVisible();
  await countItem(page, COUNTED);
  await sendToOffice(page);

  // The accountant reads D13 but has no approval bar.
  const accountant = await desk(browser, "ACCOUNTANT");
  await accountant.goto(`/inventory/stocktakes/${code}`);
  await waitForHydration(accountant, DESKTOP_READY);
  await expect(accountant.getByRole("heading", { level: 1 })).toHaveText(
    `Kiểm kê ${code}`,
  );
  await expect(
    accountant.getByRole("button", { name: "Duyệt và ghi sổ" }),
  ).toHaveCount(0);

  await director.reload();
  await waitForHydration(director, DESKTOP_READY);
  await director.getByRole("button", { name: "Duyệt và ghi sổ" }).click();
  await director
    .getByRole("alertdialog")
    .getByRole("button", { name: "Duyệt và ghi sổ" })
    .click();
  await expect(
    director.getByRole("heading", { name: "Dòng sổ kho đã ghi" }),
  ).toBeVisible();
  await expect(
    director.getByText(new RegExp(`ADJUST_IN · ${COUNTED}`)),
  ).toBeVisible();

  // Every posted line is exactly the count minus the book at the count.
  const [posted, lines] = await withDb((db) =>
    Promise.all([
      db
        .select({
          itemId: inventoryLedger.itemId,
          condition: inventoryLedger.condition,
          quantity: inventoryLedger.quantity,
          movement: inventoryLedger.movement,
        })
        .from(inventoryLedger)
        .where(eq(inventoryLedger.documentCode, code)),
      db
        .select({
          itemId: stocktakeLine.itemId,
          condition: stocktakeLine.condition,
          counted: stocktakeLine.countedQuantity,
          book: stocktakeLine.bookQuantity,
        })
        .from(stocktakeLine)
        .innerJoin(stocktake, eq(stocktake.id, stocktakeLine.stocktakeId))
        .where(eq(stocktake.code, code)),
    ]),
  );
  const off = lines.filter(
    (line) => line.counted !== null && line.counted !== line.book,
  );
  expect(posted).toHaveLength(off.length);
  for (const line of off) {
    const row = posted.find(
      (entry) =>
        entry.itemId === line.itemId && entry.condition === line.condition,
    );
    const difference = Number(line.counted) - Number(line.book);
    expect(Number(row?.quantity)).toBe(difference);
    expect(row?.movement).toBe(difference > 0 ? "ADJUST_IN" : "ADJUST_OUT");
  }
  await director.context().close();
  await accountant.context().close();
});

test("M6a and M6 baselines @visual", async ({ page }) => {
  await page.goto("/m/stocktake/new");
  await waitForHydration(page, MOBILE_READY);
  await page
    .getByRole("radio", { name: new RegExp(`^${E2E_STOCKTAKE_PLACE} · `) })
    .click();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("m6a-stocktake-start-375.png", {
    fullPage: true,
    mask: [page.locator("[data-mask]")],
    animations: "disabled",
  });
  await page.getByRole("button", { name: /^Bắt đầu đếm \d+ dòng$/ }).click();
  await page.waitForURL(/\/m\/stocktake\/KK-/);
  await waitForHydration(page, MOBILE_READY);
  await page
    .getByRole("searchbox", { name: "Tìm mã hoặc tên hàng" })
    .fill(COUNTED);
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("m6-stocktake-375.png", {
    fullPage: true,
    mask: [page.locator("[data-mask]")],
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Hủy phiên" }).click();
  await page.getByLabel("Lý do hủy").fill("Ảnh mốc E2E");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Hủy phiên" })
    .click();
  await page.waitForURL(/\/m$/);
});
