import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { resetCatalogTables } from "@/test/catalog";
import { resetInventoryTables, truncateWithLedger } from "@/test/inventory";

import { user } from "./auth";
import { item, itemGroup, supplier } from "./catalog";
import {
  purchaseOrder,
  purchaseOrderCost,
  purchaseOrderEvent,
  purchaseOrderLine,
} from "./purchasing";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

const handle = createDatabase(url);
const { db } = handle;

afterAll(handle.close);

const userId = "purchasing-schema-user";
let supplierId = "";
let itemId = "";

beforeEach(async () => {
  await truncateWithLedger(db, sql`truncate table "user" cascade`);
  await resetInventoryTables(handle);
  await resetCatalogTables(handle);
  await db.insert(user).values({
    id: userId,
    name: "Quốc Bảo",
    email: "quocbao@users.invalid",
    username: "quocbao",
    role: "SALES",
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
  supplierId = seller?.id ?? "";
});

type OrderValues = Partial<typeof purchaseOrder.$inferInsert>;

async function insertOrder(values: OrderValues = {}) {
  const [row] = await db
    .insert(purchaseOrder)
    .values({
      code: "PO-2026-001",
      supplierId,
      kind: "USED",
      createdBy: userId,
      ...values,
    })
    .returning({ id: purchaseOrder.id });
  return row?.id ?? "";
}

/** The Postgres error code of a failed statement (drizzle wraps it). */
async function errorCode(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ?? (error as { code?: string }).code ?? "unknown";
  }
  return "none";
}

describe("purchase_order checks", () => {
  it.each<[string, OrderValues]>([
    [
      "in progress with an outcome",
      {
        status: "IN_PROGRESS",
        expectedDate: "2026-10-26",
        outcome: "CLOSED",
      },
    ],
    ["done without an outcome", { status: "DONE", expectedDate: "2026-10-26" }],
    [
      "cancelled without a reason",
      {
        status: "DONE",
        outcome: "CANCELLED",
        expectedDate: "2026-10-26",
      },
    ],
    ["placed without an expected date", { status: "IN_PROGRESS" }],
    ["unknown kind", { kind: "SCRAP" }],
    ["unknown allocation", { allocationMethod: "QUANTITY" }],
  ])("refuses an order %s", async (_name, values) => {
    expect(await errorCode(() => insertOrder(values))).toBe("23514");
  });

  it("keeps a draft without an expected date and a cancelled order with a reason", async () => {
    await insertOrder();
    await insertOrder({
      code: "PO-2026-002",
      status: "DONE",
      outcome: "CANCELLED",
      expectedDate: "2026-10-26",
      endReason: "Người bán bán cho chỗ khác",
    });
    const rows = await db.select().from(purchaseOrder);
    expect(rows).toHaveLength(2);
  });
});

describe("lines and costs", () => {
  it("refuses a zero quantity and a zero cost", async () => {
    const orderId = await insertOrder();
    expect(
      await errorCode(() =>
        db.insert(purchaseOrderLine).values({
          orderId,
          lineNo: 1,
          itemId,
          unit: "PIECE",
          quantity: "0",
          unitPrice: 185_000,
        }),
      ),
    ).toBe("23514");
    expect(
      await errorCode(() =>
        db
          .insert(purchaseOrderCost)
          .values({ orderId, lineNo: 1, label: "Bốc xếp", amount: 0 }),
      ),
    ).toBe("23514");
  });

  it("refuses the same item twice in one order", async () => {
    const orderId = await insertOrder();
    const line = {
      orderId,
      itemId,
      unit: "PIECE",
      quantity: "200",
      unitPrice: 185_000,
    };
    await db.insert(purchaseOrderLine).values({ ...line, lineNo: 1 });
    expect(
      await errorCode(() =>
        db.insert(purchaseOrderLine).values({ ...line, lineNo: 2 }),
      ),
    ).toBe("23505");
  });

  it("keeps a supplier and an item an order refers to", async () => {
    const orderId = await insertOrder();
    await db.insert(purchaseOrderLine).values({
      orderId,
      lineNo: 1,
      itemId,
      unit: "KG",
      quantity: "2000",
      unitPrice: 14_000,
    });
    expect(
      await errorCode(() =>
        db.delete(supplier).where(eq(supplier.id, supplierId)),
      ),
    ).toBe("23503");
    expect(
      await errorCode(() => db.delete(item).where(eq(item.id, itemId))),
    ).toBe("23503");
  });

  it("deleting an order takes its lines, costs and events with it", async () => {
    const orderId = await insertOrder();
    await db.insert(purchaseOrderLine).values({
      orderId,
      lineNo: 1,
      itemId,
      unit: "PIECE",
      quantity: "200",
      unitPrice: 185_000,
    });
    await db
      .insert(purchaseOrderCost)
      .values({ orderId, lineNo: 1, label: "Cước xe tải", amount: 3_500_000 });
    await db
      .insert(purchaseOrderEvent)
      .values({ orderId, kind: "CREATED", actorId: userId });
    await db.delete(purchaseOrder).where(eq(purchaseOrder.id, orderId));
    expect(await db.select().from(purchaseOrderLine)).toHaveLength(0);
    expect(await db.select().from(purchaseOrderCost)).toHaveLength(0);
    expect(await db.select().from(purchaseOrderEvent)).toHaveLength(0);
  });
});
