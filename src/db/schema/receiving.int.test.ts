import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { getAdminDatabase } from "@/test/admin";
import { resetCatalogTables } from "@/test/catalog";
import { resetInventoryTables, truncateWithLedger } from "@/test/inventory";

import { user } from "./auth";
import { item, itemGroup, location, supplier } from "./catalog";
import {
  purchaseOrder,
  purchaseOrderEvent,
  purchaseOrderLine,
} from "./purchasing";
import {
  goodsReceipt,
  goodsReceiptCost,
  goodsReceiptLine,
  scrapPrice,
} from "./receiving";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

const handle = createDatabase(url);
const { db } = handle;

afterAll(handle.close);

// The app role is refused scrap_price changes by its privileges
// (src/db/privileges.int.test.ts); the owner shows the trigger still holds.
const admin = getAdminDatabase();

const userId = "receiving-schema-user";
let orderId = "";
let orderLineId = "";
let itemId = "";
let yardId = "";

beforeEach(async () => {
  await truncateWithLedger(sql`truncate table "user" cascade`);
  await resetInventoryTables();
  await resetCatalogTables();
  await db.insert(user).values({
    id: userId,
    name: "Văn Tùng",
    email: "vantung@users.invalid",
    username: "vantung",
    role: "WAREHOUSE",
  });
  const [group] = await db
    .insert(itemGroup)
    .values({ name: "Giàn giáo", nameKey: "gian giao" })
    .returning({ id: itemGroup.id });
  const [row] = await db
    .insert(item)
    .values({
      code: "GG-K17",
      name: "Khung giàn giáo 1,7m",
      groupId: group?.id ?? "",
      unit: "PIECE",
      standardWeightKg: "13.500",
      searchText: "khung gian giao 1,7m gg-k17",
    })
    .returning({ id: item.id });
  itemId = row?.id ?? "";
  const [seller] = await db
    .insert(supplier)
    .values({
      code: "NCC-0001",
      kind: "PERSON",
      name: "Anh Trần Văn Hùng",
      searchText: "anh tran van hung ncc-0001",
    })
    .returning({ id: supplier.id });
  const [order] = await db
    .insert(purchaseOrder)
    .values({
      code: "PO-2026-052",
      supplierId: seller?.id ?? "",
      kind: "USED",
      status: "IN_PROGRESS",
      expectedDate: "2026-10-26",
      createdBy: userId,
    })
    .returning({ id: purchaseOrder.id });
  orderId = order?.id ?? "";
  const [line] = await db
    .insert(purchaseOrderLine)
    .values({
      orderId,
      lineNo: 1,
      itemId,
      unit: "PIECE",
      quantity: "200",
      unitPrice: 185_000,
    })
    .returning({ id: purchaseOrderLine.id });
  orderLineId = line?.id ?? "";
  const [yard] = await db
    .select({ id: location.id })
    .from(location)
    .where(eq(location.code, "BAI-01"));
  yardId = yard?.id ?? "";
});

type ReceiptValues = Partial<typeof goodsReceipt.$inferInsert>;
type LineValues = Partial<typeof goodsReceiptLine.$inferInsert>;

async function insertReceipt(values: ReceiptValues = {}) {
  const [row] = await db
    .insert(goodsReceipt)
    .values({
      code: "PN-2026-094",
      orderId,
      tripNo: 1,
      locationId: yardId,
      clientDraftId: crypto.randomUUID(),
      businessDate: "2026-10-26",
      postingId: crypto.randomUUID(),
      createdBy: userId,
      ...values,
    })
    .returning({ id: goodsReceipt.id });
  return row?.id ?? "";
}

async function insertLine(receiptId: string, values: LineValues = {}) {
  await db.insert(goodsReceiptLine).values({
    receiptId,
    lineNo: 1,
    orderLineId,
    itemId,
    status: "COUNTED",
    quantity: "196",
    qtyGood: "150",
    qtyNeedsRepair: "34",
    qtyScrap: "12",
    ...values,
  });
}

async function errorCode(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ?? (error as { code?: string }).code ?? "unknown";
  }
  return "none";
}

async function errorMessage(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause;
    return cause?.message ?? (error as Error).message;
  }
  return "none";
}

describe("goods_receipt checks", () => {
  it("refuses trip 0 and a scrap price id without its value", async () => {
    expect(await errorCode(() => insertReceipt({ tripNo: 0 }))).toBe("23514");
    const [price] = await db
      .insert(scrapPrice)
      .values({ pricePerKg: 7_500, createdBy: userId })
      .returning({ id: scrapPrice.id });
    expect(
      await errorCode(() => insertReceipt({ scrapPriceId: price?.id })),
    ).toBe("23514");
    expect(
      await errorCode(() =>
        insertReceipt({ scrapPriceId: price?.id, scrapPricePerKg: 7_500 }),
      ),
    ).toBe("none");
  });

  it("refuses two receipts for one draft or one trip", async () => {
    const draft = crypto.randomUUID();
    await insertReceipt({ clientDraftId: draft });
    expect(
      await errorCode(() =>
        insertReceipt({ code: "PN-2026-095", tripNo: 2, clientDraftId: draft }),
      ),
    ).toBe("23505");
    expect(
      await errorCode(() => insertReceipt({ code: "PN-2026-096", tripNo: 1 })),
    ).toBe("23505");
  });
});

describe("goods_receipt_line checks", () => {
  it.each<[string, LineValues]>([
    ["unknown status", { status: "LOST" }],
    ["split not adding up", { qtyNeedsRepair: "30" }],
    ["negative part", { qtyGood: "-1", qtyNeedsRepair: "185" }],
    ["zero weighed kg", { weighedKg: "0" }],
    [
      "counted with zero",
      { quantity: "0", qtyGood: "0", qtyNeedsRepair: "0", qtyScrap: "0" },
    ],
    ["not in trip with a quantity", { status: "NOT_IN_TRIP" }],
    [
      "not in trip with weighed kg",
      {
        status: "NOT_IN_TRIP",
        quantity: "0",
        qtyGood: "0",
        qtyNeedsRepair: "0",
        qtyScrap: "0",
        weighedKg: "10",
      },
    ],
  ])("refuses a line with %s", async (_name, values) => {
    const receiptId = await insertReceipt();
    expect(await errorCode(() => insertLine(receiptId, values))).toBe("23514");
  });

  it("keeps a not-in-trip line at zero and refuses the same order line twice", async () => {
    const receiptId = await insertReceipt();
    await insertLine(receiptId, {
      status: "NOT_IN_TRIP",
      quantity: "0",
      qtyGood: "0",
      qtyNeedsRepair: "0",
      qtyScrap: "0",
      awaitsRest: true,
    });
    expect(await errorCode(() => insertLine(receiptId, { lineNo: 2 }))).toBe(
      "23505",
    );
  });

  it("keeps an order line that a receipt refers to", async () => {
    const receiptId = await insertReceipt();
    await insertLine(receiptId);
    expect(
      await errorCode(() =>
        db
          .delete(purchaseOrderLine)
          .where(eq(purchaseOrderLine.id, orderLineId)),
      ),
    ).toBe("23503");
  });

  it("refuses a zero trip cost", async () => {
    const receiptId = await insertReceipt();
    expect(
      await errorCode(() =>
        db
          .insert(goodsReceiptCost)
          .values({ receiptId, lineNo: 1, label: "Bốc xếp", amount: 0 }),
      ),
    ).toBe("23514");
  });
});

describe("scrap_price", () => {
  it("refuses a zero price", async () => {
    expect(
      await errorCode(() =>
        db.insert(scrapPrice).values({ pricePerKg: 0, createdBy: userId }),
      ),
    ).toBe("23514");
  });

  it("is append-only", async () => {
    await db
      .insert(scrapPrice)
      .values({ pricePerKg: 7_500, createdBy: userId });
    expect(
      await errorMessage(() =>
        admin.update(scrapPrice).set({ pricePerKg: 8_000 }),
      ),
    ).toContain("Giá sắt vụn chỉ ghi thêm");
    expect(await errorMessage(() => admin.delete(scrapPrice))).toContain(
      "Giá sắt vụn chỉ ghi thêm",
    );
    const rows = await db.select().from(scrapPrice);
    expect(rows.map((row) => row.pricePerKg)).toEqual([7_500]);
  });
});

describe("purchase_order_event kinds", () => {
  it("accepts the goods-receipt kinds", async () => {
    for (const kind of ["RECEIPT_POSTED", "BACKORDER_MARKED", "RECEIVED"]) {
      await db
        .insert(purchaseOrderEvent)
        .values({ orderId, kind, actorId: userId, note: "PN-2026-094" });
    }
    const rows = await db.select().from(purchaseOrderEvent);
    expect(rows).toHaveLength(3);
  });
});
