// Posting goods receipts (goods-receipt tasks 4.3–4.6).
import { and, asc, count, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  goodsReceipt,
  goodsReceiptLine,
  inventoryCost,
  inventoryLedger,
  item,
  location,
  purchaseOrder,
  purchaseOrderEvent,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { reconcileInventory } from "@/lib/inventory/reconcile";
import { postMovements } from "@/lib/inventory/post";
import { closeOrder, updateOrder } from "@/lib/purchasing/orders";
import { getOrderByCode } from "@/lib/purchasing/queries";
import { receiptSummary } from "@/lib/purchasing/receipts";
import { createTestContext } from "@/test/auth";
import { d3Order } from "@/test/purchasing";
import {
  counted,
  notInTrip,
  OCT_26,
  orderLineIds,
  placedOrder,
  setupReceivingFixture,
  tripOne,
  tripTwo,
  type ReceivingFixture,
} from "@/test/receiving";

import type { ReceiptBody } from "./body";
import { postReceipt } from "./post";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: ReceivingFixture;
let code: string;
let lines: Map<string, string>;

beforeEach(async () => {
  fx = await setupReceivingFixture(ctx);
  code = await placedOrder(ctx, fx);
  lines = await orderLineIds(ctx, code);
});

const post = (body: ReceiptBody, actor = fx.warehouse) =>
  postReceipt(ctx.db, actor, body, { now: OCT_26 });

async function posted(body: ReceiptBody) {
  const result = await post(body);
  if (!result.ok) throw new Error(`${result.status} ${result.error}`);
  return result.data;
}

async function orderRow() {
  const [row] = await ctx.db
    .select()
    .from(purchaseOrder)
    .where(eq(purchaseOrder.code, code));
  return row;
}

async function events() {
  const [order] = await ctx.db
    .select({ id: purchaseOrder.id })
    .from(purchaseOrder)
    .where(eq(purchaseOrder.code, code));
  return ctx.db
    .select({
      kind: purchaseOrderEvent.kind,
      note: purchaseOrderEvent.note,
      actorId: purchaseOrderEvent.actorId,
    })
    .from(purchaseOrderEvent)
    .where(eq(purchaseOrderEvent.orderId, order?.id ?? ""))
    .orderBy(asc(purchaseOrderEvent.id));
}

const receiptCount = async () =>
  (await ctx.db.select({ n: count() }).from(goodsReceipt))[0]?.n ?? 0;
const ledgerCount = async () =>
  (await ctx.db.select({ n: count() }).from(inventoryLedger))[0]?.n ?? 0;

/** A one-line order of 200 Khung for the simpler status cases. */
async function khungOrder(kind: "NEW" | "USED" = "USED", quantity = "200") {
  const body = d3Order(fx);
  const one = await placedOrder(ctx, fx, {
    ...body,
    kind,
    lines: body.lines?.slice(0, 1).map((line) => ({ ...line, quantity })),
    costs: [],
  });
  return {
    code: one,
    line: (await orderLineIds(ctx, one)).get("GG-K17") ?? "",
  };
}

const split = (kind: "NEW" | "USED", n: string) =>
  kind === "NEW" ? { NEW: n } : { GOOD: n };

function oneLine(
  order: { code: string; line: string },
  quantity: string,
  extra: {
    kind?: "NEW" | "USED";
    awaitsRest?: boolean;
    confirm?: string[];
  } = {},
): ReceiptBody {
  return {
    draftId: crypto.randomUUID(),
    orderCode: order.code,
    lines: [
      counted(order.line, quantity, split(extra.kind ?? "USED", quantity), {
        awaitsRest: extra.awaitsRest ?? false,
      }),
    ],
    costs: [],
    confirmedOverrides: extra.confirm ?? [],
  };
}

describe("posting a trip writes the ledger in one transaction (4.3)", () => {
  it("books the 6 PURCHASE_IN lines of trip 1, design D4", async () => {
    const receipt = await posted(tripOne(code, lines));
    expect(receipt).toMatchObject({
      code: "PN-2026-001",
      tripNo: 1,
      orderStatus: "IN_PROGRESS",
      replayed: false,
    });
    const rows = await ctx.db
      .select({
        itemCode: item.code,
        condition: inventoryLedger.condition,
        movement: inventoryLedger.movement,
        quantity: inventoryLedger.quantity,
        amount: inventoryLedger.amount,
        documentType: inventoryLedger.documentType,
        documentCode: inventoryLedger.documentCode,
        businessDate: inventoryLedger.businessDate,
        place: location.code,
      })
      .from(inventoryLedger)
      .innerJoin(item, eq(item.id, inventoryLedger.itemId))
      .innerJoin(location, eq(location.id, inventoryLedger.locationId))
      .orderBy(asc(inventoryLedger.id));
    expect(
      rows.map((row) => [
        row.itemCode,
        row.condition,
        row.quantity,
        row.amount,
      ]),
    ).toEqual([
      ["GG-K17", "GOOD", "150.000", 31_037_720],
      ["GG-K17", "NEEDS_REPAIR", "34.000", 7_035_216],
      ["GG-K17", "SCRAP", "12.000", 1_215_000],
      ["GG-CH", "GOOD", "380.000", 13_175_436],
      ["GG-CH", "NEEDS_REPAIR", "20.000", 693_444],
      ["PL-SAT", "SCRAP", "1250.500", 10_161_934],
    ]);
    for (const row of rows) {
      expect(row).toMatchObject({
        movement: "PURCHASE_IN",
        documentType: "GOODS_RECEIPT",
        documentCode: "PN-2026-001",
        businessDate: "2026-10-26",
        place: "BAI-01",
      });
    }
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(
      58_438_750 + 4_880_000,
    );
    const [saved] = await ctx.db.select().from(goodsReceipt);
    expect(saved).toMatchObject({
      scrapPricePerKg: 7_500,
      vehicle: "29H-123.45",
    });
    expect(await reconcileInventory(ctx.db)).toEqual([]);
  });

  it("moves the average cost of GG-K17 Tốt", async () => {
    const [k17] = await ctx.db
      .select({ id: item.id })
      .from(item)
      .where(eq(item.code, "GG-K17"));
    const [yard] = await ctx.db
      .select({ id: location.id })
      .from(location)
      .where(eq(location.code, "BAI-01"));
    await ctx.db.transaction((tx) =>
      postMovements(
        tx,
        fx.director,
        {
          documentType: "OPENING",
          documentId: null,
          documentCode: "TDK-2026-001",
          businessDate: "2026-10-25" as BusinessDate,
          lines: [
            {
              itemId: k17?.id ?? "",
              condition: "GOOD",
              locationId: yard?.id ?? "",
              movement: "OPENING",
              quantityMilli: 1_220_000,
              amount: 1_220 * 195_000,
              description: "Tồn đầu kỳ",
            },
          ],
        },
        "2026-10-26" as BusinessDate,
      ),
    );
    await posted(tripOne(code, lines));
    const [cost] = await ctx.db
      .select({ avg: inventoryCost.avgCost })
      .from(inventoryCost)
      .where(
        and(
          eq(inventoryCost.itemId, k17?.id ?? ""),
          eq(inventoryCost.condition, "GOOD"),
        ),
      );
    expect(cost?.avg).toBe(196_305);
  });

  it("writes nothing when an item was archived meanwhile", async () => {
    await ctx.db
      .update(item)
      .set({ status: "ARCHIVED" })
      .where(eq(item.code, "GG-CH"));
    const before = (await events()).length;
    const result = await post(tripOne(code, lines));
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      error: "Vật tư GG-CH đã ngừng dùng",
    });
    expect(await receiptCount()).toBe(0);
    expect(await ledgerCount()).toBe(0);
    expect((await orderRow())?.status).toBe("IN_PROGRESS");
    expect((await events()).length).toBe(before);
  });

  it("writes nothing without a scrap price", async () => {
    fx = await setupReceivingFixture(ctx, { scrapPrice: false });
    code = await placedOrder(ctx, fx);
    lines = await orderLineIds(ctx, code);
    const result = await post(tripOne(code, lines));
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      error: "Chưa có giá sắt vụn tham khảo, nhờ Giám đốc nhập ở Cài đặt",
    });
    expect(await receiptCount()).toBe(0);
    expect(await ledgerCount()).toBe(0);
  });

  it("records the anomalies the storekeeper confirmed", async () => {
    const body = tripOne(code, lines);
    body.lines = body.lines?.map((line) =>
      line.orderLineId === lines.get("GG-K17")
        ? counted(line.orderLineId ?? "", "2000", { GOOD: "2000" })
        : line,
    );
    body.confirmedOverrides = [`line:${lines.get("GG-K17")}`];
    await posted(body);
    expect(
      (await events()).find((event) => event.kind === "RECEIPT_POSTED")?.note,
    ).toBe("PN-2026-001 · đã xác nhận nhận dư GG-K17 2.000/200 cái");
  });
});

describe("a receipt must count or mark every open line (4.4)", () => {
  it("refuses a missing line", async () => {
    const body = tripOne(code, lines);
    body.lines = body.lines?.filter(
      (line) => line.orderLineId !== lines.get("GG-M16"),
    );
    expect(await post(body)).toEqual({
      ok: false,
      status: 422,
      error: 'Còn 1 mã chưa đếm hoặc đánh dấu "Chuyến này không có"',
      field: "lines",
    });
    expect(await receiptCount()).toBe(0);
    expect(await ledgerCount()).toBe(0);
  });

  it("refuses a trip where nothing came", async () => {
    const body = tripOne(code, lines);
    body.lines = [...lines.values()].map((id) => notInTrip(id));
    expect(await post(body)).toMatchObject({
      status: 422,
      error: "Chuyến này chưa nhận mã nào",
    });
  });

  it("refuses a line the order does not have", async () => {
    const body = tripOne(code, lines);
    body.lines = [...(body.lines ?? []), notInTrip(crypto.randomUUID())];
    expect(await post(body)).toMatchObject({
      status: 409,
      error: `Đơn ${code} vừa thay đổi, mở lại đơn để đếm theo số mới`,
    });
  });

  it("refuses a draft counted against lines the office replaced", async () => {
    const draft = tripOne(code, lines);
    const order = await getOrderByCode(ctx.db, code);
    const edited = await updateOrder(ctx.db, fx.sales, code, {
      ...d3Order(fx),
      updatedAt: order?.updatedAt.toISOString(),
    });
    expect(edited.ok).toBe(true);
    expect(await post(draft)).toMatchObject({
      status: 409,
      error: `Đơn ${code} vừa thay đổi, mở lại đơn để đếm theo số mới`,
    });
  });

  it("refuses an unconfirmed stray zero and unconfirmed high costs (D5b)", async () => {
    const body = tripOne(code, lines);
    body.lines = body.lines?.map((line) =>
      line.orderLineId === lines.get("GG-K17")
        ? counted(line.orderLineId ?? "", "2000", { GOOD: "2000" })
        : line,
    );
    expect(await post(body)).toEqual({
      ok: false,
      status: 422,
      error: "Nhận 2.000 cái, đơn chỉ còn 200. Đúng không?",
      field: "lines.0.quantity",
    });
    body.confirmedOverrides = [`line:${lines.get("GG-K17")}`];
    body.costs = [{ label: "Cước xe tải", amount: 35_000_000 }];
    expect(await post(body)).toEqual({
      ok: false,
      status: 422,
      error:
        "Chi phí chuyến 35.000.000 ₫, cả đơn dự kiến 4.880.000 ₫. Đúng không?",
      field: "costs",
    });
    expect(await receiptCount()).toBe(0);
    body.confirmedOverrides = [`line:${lines.get("GG-K17")}`, "costs"];
    expect((await post(body)).ok).toBe(true);
  });

  it("asks again when another trip shrank what is left", async () => {
    const order = await khungOrder();
    const waiting = oneLine(order, "200");
    await posted(oneLine(order, "100", { awaitsRest: true }));
    expect(await post(waiting)).toMatchObject({
      status: 422,
      error: "Nhận 200 cái, đơn chỉ còn 100. Đúng không?",
    });
  });
});

describe("the order after a receipt (4.5)", () => {
  it("keeps waiting after trip 1 and closes short after trip 2", async () => {
    await posted(tripOne(code, lines));
    expect(await orderRow()).toMatchObject({
      status: "IN_PROGRESS",
      outcome: null,
    });
    expect((await events()).slice(-2)).toEqual([
      { kind: "RECEIPT_POSTED", note: "PN-2026-001", actorId: fx.warehouse.id },
      {
        kind: "BACKORDER_MARKED",
        note: "150 mâm giàn giáo 1,6m",
        actorId: fx.warehouse.id,
      },
    ]);
    const second = await posted(tripTwo(code, lines));
    expect(second).toMatchObject({
      tripNo: 2,
      orderStatus: "DONE",
      orderOutcome: "CLOSED",
    });
    expect(await orderRow()).toMatchObject({
      status: "DONE",
      outcome: "CLOSED",
      endReason: "Nhận thiếu, không chờ giao bù",
      endedBy: fx.warehouse.id,
    });
    expect((await events()).slice(-2)).toEqual([
      { kind: "RECEIPT_POSTED", note: "PN-2026-002", actorId: fx.warehouse.id },
      {
        kind: "CLOSED",
        note: "Nhận thiếu, không chờ giao bù",
        actorId: fx.warehouse.id,
      },
    ]);
  });

  it("receives in full", async () => {
    const order = await khungOrder("NEW", "10");
    const result = await posted(oneLine(order, "10", { kind: "NEW" }));
    expect(result).toMatchObject({
      orderStatus: "DONE",
      orderOutcome: "RECEIVED",
    });
    code = order.code;
    expect((await events()).at(-1)).toMatchObject({ kind: "RECEIVED" });
  });

  it("closes at once when the first trip is short and nobody waits", async () => {
    const order = await khungOrder();
    const result = await posted(oneLine(order, "196"));
    expect(result).toMatchObject({
      orderStatus: "DONE",
      orderOutcome: "CLOSED",
    });
  });

  it("refuses a trip after the office closed the order", async () => {
    const order = await khungOrder();
    await posted(oneLine(order, "60", { awaitsRest: true }));
    expect((await closeOrder(ctx.db, fx.sales, order.code, null)).ok).toBe(
      true,
    );
    expect(await post(oneLine(order, "140"))).toMatchObject({
      status: 409,
      error: `Đơn ${order.code} đã xong, không nhập thêm được`,
    });
  });
});

describe("resending a draft never makes a second receipt (4.6)", () => {
  it("returns the receipt already made for a draft", async () => {
    const body = tripOne(code, lines);
    await posted(body);
    const again = await post(body);
    expect(again).toMatchObject({
      ok: true,
      data: { code: "PN-2026-001", replayed: true },
    });
    expect(await receiptCount()).toBe(1);
    expect(await ledgerCount()).toBe(6);
  });

  it("makes one receipt when the same draft arrives twice at once", async () => {
    const body = tripOne(code, lines);
    const [a, b] = await Promise.all([post(body), post(body)]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.data.code).toBe(b.data.code);
    expect(await receiptCount()).toBe(1);
    expect(await ledgerCount()).toBe(6);
  });

  it("refuses a draft id another user already posted", async () => {
    const body = tripOne(code, lines);
    await posted(body);
    expect(await post(body, fx.director)).toMatchObject({
      status: 409,
      error: "Mã nháp này đã dùng cho phiếu của người khác",
    });
  });

  it("runs two different trips of one order one after the other", async () => {
    const order = await khungOrder();
    const [a, b] = await Promise.all([
      post(oneLine(order, "60", { awaitsRest: true })),
      post(oneLine(order, "60", { awaitsRest: true })),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect([a.data.tripNo, b.data.tripNo].sort()).toEqual([1, 2]);
    }
    const [row] = await ctx.db
      .select({ id: purchaseOrder.id })
      .from(purchaseOrder)
      .where(eq(purchaseOrder.code, order.code));
    const summary = await receiptSummary(ctx.db, row?.id ?? "");
    expect(summary.lines[0]?.receivedMilli).toBe(120_000);
  });

  it("gives one consistent answer when a trip races the office closing", async () => {
    const order = await khungOrder();
    await posted(oneLine(order, "60", { awaitsRest: true }));
    const [receipt, closed] = await Promise.all([
      post(oneLine(order, "60", { awaitsRest: true })),
      closeOrder(ctx.db, fx.sales, order.code, null),
    ]);
    const trips = await ctx.db
      .select({ n: count() })
      .from(goodsReceipt)
      .innerJoin(purchaseOrder, eq(purchaseOrder.id, goodsReceipt.orderId))
      .where(eq(purchaseOrder.code, order.code));
    expect(closed.ok).toBe(true);
    expect(trips[0]?.n).toBe(receipt.ok ? 2 : 1);
    if (!receipt.ok) {
      expect(receipt.error).toBe(
        `Đơn ${order.code} đã xong, không nhập thêm được`,
      );
    }
    const lineCount = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(goodsReceiptLine);
    expect(lineCount[0]?.n).toBe(receipt.ok ? 2 : 1);
  });
});
