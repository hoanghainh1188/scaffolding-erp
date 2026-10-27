// Phone reads (goods-receipt task 4.7).
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { closeOrder } from "@/lib/purchasing/orders";
import { createTestContext } from "@/test/auth";
import { d3Order } from "@/test/purchasing";
import {
  OCT_26,
  orderLineIds,
  placedOrder,
  setupReceivingFixture,
  tripOne,
  tripTwo,
  type ReceivingFixture,
} from "@/test/receiving";

import { postReceipt } from "./post";
import {
  arrivals,
  orderForReceiving,
  receiptByCode,
  receiptsByDay,
  stockLookup,
} from "./queries";

const ctx = createTestContext();
afterAll(ctx.close);

const TODAY = "2026-10-26" as BusinessDate;

let fx: ReceivingFixture;
beforeEach(async () => {
  fx = await setupReceivingFixture(ctx);
});

async function order(expectedDate: string, expectedTime: string | null) {
  return placedOrder(ctx, fx, { ...d3Order(fx), expectedDate, expectedTime });
}

async function post(code: string, trip = tripOne, now = OCT_26) {
  const lines = await orderLineIds(ctx, code);
  const result = await postReceipt(ctx.db, fx.warehouse, trip(code, lines), {
    now,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

describe("arrivals (M1)", () => {
  it("lists late and today first, then tomorrow, and counts the rest", async () => {
    const today = await order("2026-10-26", "09:30");
    const late = await order("2026-10-24", null);
    const tomorrow = await order("2026-10-27", "14:00");
    await order("2026-10-30", null);
    const result = await arrivals(ctx.db, TODAY);
    expect(result.cards.map((card) => [card.code, card.label.text])).toEqual([
      [late, "Trễ 2 ngày"],
      [today, "09:30"],
      [tomorrow, "Mai 14:00"],
    ]);
    expect(result.dueToday).toBe(2);
    expect(result.later).toBe(1);
    expect(result.cards[1]).toMatchObject({
      supplierName: "Chú Ba ve chai",
      kind: "USED",
      vehicle: "Xe tải 29C-123.45",
      openLines: 4,
      hasReceipts: false,
      waiting: null,
    });
  });

  it("shows what a receiving order waits for, and drops a closed one", async () => {
    const code = await order("2026-10-26", "09:30");
    await post(code);
    expect((await arrivals(ctx.db, TODAY)).cards[0]).toMatchObject({
      hasReceipts: true,
      openLines: 1,
      waiting: "150 mâm giàn giáo 1,6m",
    });
    expect((await closeOrder(ctx.db, fx.sales, code, null)).ok).toBe(true);
    expect((await arrivals(ctx.db, TODAY)).cards).toEqual([]);
  });
});

describe("orderForReceiving (M3)", () => {
  it("prefills the expected costs on the first trip only", async () => {
    const code = await order("2026-10-26", "09:30");
    const first = await orderForReceiving(ctx.db, code);
    expect(first).toMatchObject({ tripNo: 1, status: "IN_PROGRESS" });
    expect(first?.lines.map((line) => line.itemName)).toEqual([
      "Khung giàn giáo 1,7m",
      "Chéo giàn giáo",
      "Mâm giàn giáo 1,6m",
      "Phế liệu sắt lẫn",
    ]);
    expect(first?.prefilledCosts.map((cost) => cost.amount)).toEqual([
      3_500_000, 1_200_000, 180_000,
    ]);
    expect(first?.expectedCosts).toBe(4_880_000);
    expect(first?.yards.map((yard) => yard.code)).toEqual(["BAI-01"]);
    expect(first?.scrapPrice?.pricePerKg).toBe(7_500);
    expect(JSON.stringify(first)).not.toContain("unitPrice");
    await post(code);
    const second = await orderForReceiving(ctx.db, code);
    expect(second).toMatchObject({ tripNo: 2, prefilledCosts: [] });
    expect(second?.lines.map((line) => line.itemCode)).toEqual(["GG-M16"]);
  });

  it("returns a finished order so M3 can say so, and null for none", async () => {
    const code = await order("2026-10-26", null);
    await post(code);
    await post(code, tripTwo);
    expect((await orderForReceiving(ctx.db, code))?.status).toBe("DONE");
    expect(await orderForReceiving(ctx.db, "PO-2026-999")).toBeNull();
  });
});

describe("receipts (M7 and the receipt view)", () => {
  it("groups receipts by day, newest first", async () => {
    const a = await order("2026-10-25", null);
    const b = await order("2026-10-26", null);
    await post(a, tripOne, new Date("2026-10-25T03:00:00Z"));
    await post(b, tripOne, OCT_26);
    await post(b, tripTwo, new Date("2026-10-26T05:00:00Z"));
    const page = await receiptsByDay(ctx.db, { days: 1 });
    expect(page.days.map((day) => day.date)).toEqual(["2026-10-26"]);
    expect(page.days[0]?.receipts.map((r) => [r.code, r.countedItems])).toEqual(
      [
        ["PN-2026-003", 1],
        ["PN-2026-002", 3],
      ],
    );
    expect(page.hasMore).toBe(true);
    const older = await receiptsByDay(ctx.db, { before: TODAY, days: 7 });
    expect(older.days.map((day) => day.date)).toEqual(["2026-10-25"]);
    expect(older.hasMore).toBe(false);
  });

  it("reads one receipt with its lines and costs", async () => {
    const code = await order("2026-10-26", null);
    await post(code);
    const view = await receiptByCode(ctx.db, "PN-2026-001");
    expect(view).toMatchObject({
      orderCode: code,
      tripNo: 1,
      createdByName: "Văn Tùng",
      locationName: "Bãi chính",
      scrapPricePerKg: 7_500,
      totalCosts: 4_880_000,
    });
    expect(view?.lines.map((line) => [line.itemCode, line.status])).toEqual([
      ["GG-K17", "COUNTED"],
      ["GG-CH", "COUNTED"],
      ["GG-M16", "NOT_IN_TRIP"],
      ["PL-SAT", "COUNTED"],
    ]);
    expect(view?.lines[0]?.split).toEqual({
      NEW: 0,
      GOOD: 150_000,
      NEEDS_REPAIR: 34_000,
      SCRAP: 12_000,
    });
    expect(view?.lines[2]?.awaitsRest).toBe(true);
    expect(await receiptByCode(ctx.db, "PN-2026-999")).toBeNull();
  });
});

describe("stockLookup (M2)", () => {
  it("returns quantities by place and condition, no cost", async () => {
    const code = await order("2026-10-26", null);
    await post(code);
    const stock = await stockLookup(ctx.db, "GG-K17");
    expect(stock).toEqual({
      code: "GG-K17",
      name: "Khung giàn giáo 1,7m",
      unit: "PIECE",
      standardWeightKg: "13.500",
      yard: { NEW: 0, GOOD: 150_000, NEEDS_REPAIR: 34_000, SCRAP: 12_000 },
      workshop: 0,
      sites: 0,
    });
    expect(await stockLookup(ctx.db, "GG-X99")).toBeNull();
  });
});
