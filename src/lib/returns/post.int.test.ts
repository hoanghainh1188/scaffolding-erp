// "Lưu phiếu thu hồi" (returns spec "Ghi sổ thu hồi", "Chỉ thu hồi hàng
// đang ở công trình của hợp đồng", "Ngày trả là ngày ghi sổ", "Một lần lưu
// chỉ ghi sổ một lần"; compensations spec "Phiếu đền bù tự sinh…", "Giá theo
// bản hợp đồng tại ngày trả"; tasks 3.2–3.4).
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import {
  compensationNote,
  compensationNoteLine,
  contract,
  documentCounter,
  inventoryCost,
  inventoryLedger,
  location,
  returnNote,
} from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { quantityFromDb } from "@/domain/quantity";
import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import { approvedKgSale } from "@/test/deliveries";
import {
  deliverMore,
  RETURN_NOW,
  returnOf,
  setupReturnFixture,
  type ReturnFixture,
} from "@/test/returns";
import {
  approveAmendment,
  createAmendment,
  submitAmendment,
  updateAmendment,
} from "@/lib/contracts/amendments";
import { d5Rental } from "@/test/contracts";
import { onSiteByItem } from "@/lib/deliveries/records";
import { reconcileInventory } from "@/lib/inventory/reconcile";
import { setScrapPrice } from "@/lib/receiving/scrap-price";

import { postReturn } from "./post";

const ctx = createTestContext();
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});

let fx: ReturnFixture;
beforeEach(async () => {
  fx = await setupReturnFixture(ctx);
});

const milli = (value: string) => quantityFromDb(value, "KG").milli;

async function ledgerOf(code: string) {
  return ctx.db
    .select()
    .from(inventoryLedger)
    .where(eq(inventoryLedger.documentCode, code))
    .orderBy(inventoryLedger.id);
}

async function avg(code: string, condition: string) {
  const [row] = await ctx.db
    .select({ avg: inventoryCost.avgCost })
    .from(inventoryCost)
    .where(
      and(
        eq(inventoryCost.itemId, fx.item(code)),
        eq(inventoryCost.condition, condition),
      ),
    );
  return row?.avg ?? null;
}

async function setScrap(pricePerKg: number) {
  const result = await setScrapPrice(ctx.db, fx.director, { pricePerKg });
  if (!result.ok) throw new Error(result.error);
}

const D1 = { "GG-K17": [80, 15, 3, 2] as [number, number, number, number] };

describe("postReturn: ledger", () => {
  it("posts out of the site, into the yard, Mới first, and the loss", async () => {
    await setScrap(7_500);
    const result = await returnOf(ctx, fx, D1);
    expect(result).toMatchObject({
      ok: true,
      data: { code: "PTH-2026-001", businessDate: "2026-11-05" },
    });
    const rows = await ledgerOf("PTH-2026-001");
    expect(
      rows.map((row) => [
        row.movement,
        row.condition,
        row.locationId === fx.yard
          ? "BAI"
          : row.locationId === fx.siteLocation
            ? "CT"
            : "?",
        milli(row.quantity) / 1000,
        row.amount,
      ]),
    ).toEqual([
      ["RETURN_OUT", "NEW", "CT", -30, -6_300_000],
      ["RETURN_OUT", "GOOD", "CT", -68, -13_260_000],
      ["RETURN_IN", "GOOD", "BAI", 80, 15_600_000],
      ["RETURN_IN", "NEEDS_REPAIR", "BAI", 15, 2_925_000],
      // First Phế liệu of GG-K17: 13,5 kg × 7.500 ₫ = 101.250 ₫ (0.2 #62).
      ["RETURN_IN", "SCRAP", "BAI", 3, 303_750],
      ["LOSS_OUT", "GOOD", "CT", -2, -390_000],
    ]);
    expect(rows.every((row) => row.businessDate === "2026-11-05")).toBe(true);
    expect(
      (await onSiteByItem(ctx.db, fx.deal.id)).get(fx.item("GG-K17")),
    ).toBe(20_000);
  });

  it("keeps every average and the books reconciled", async () => {
    await setScrap(7_500);
    await returnOf(ctx, fx, D1);
    expect(await avg("GG-K17", "NEW")).toBe(210_000);
    expect(await avg("GG-K17", "GOOD")).toBe(195_000);
    expect(await avg("GG-K17", "NEEDS_REPAIR")).toBe(195_000);
    expect(await avg("GG-K17", "SCRAP")).toBe(101_250);
    expect(await reconcileInventory(ctx.db)).toEqual([]);
  });

  it("uses the scrap average once there is one", async () => {
    await setScrap(7_500);
    // GG-M16 Phế liệu already has 50.000 ₫ (opening stock).
    await returnOf(ctx, fx, { "GG-M16": [0, 0, 3, 0] });
    const [, into] = await ledgerOf("PTH-2026-001");
    expect(into).toMatchObject({ movement: "RETURN_IN", unitCost: 50_000 });
  });

  it("refuses first Phế liệu without a scrap price, posting nothing", async () => {
    const result = await returnOf(ctx, fx, D1);
    expect(result).toMatchObject({
      ok: false,
      error:
        "Chưa có đơn giá sắt vụn tham chiếu. Vui lòng cập nhật đơn giá trong Cài đặt.",
    });
    expect(await ctx.db.select().from(returnNote)).toHaveLength(0);
  });

  it("brings goods back as they left without changing the company stock", async () => {
    const before = await avg("GG-CH", "GOOD");
    await returnOf(ctx, fx, { "GG-CH": [50, 0, 0, 0] });
    const rows = await ledgerOf("PTH-2026-001");
    expect(rows.map((row) => row.amount)).toEqual([-2_600_000, 2_600_000]);
    expect(await avg("GG-CH", "GOOD")).toBe(before);
  });
});

describe("postReturn: what may come back", () => {
  it("refuses more than is on site", async () => {
    const result = await returnOf(ctx, fx, { "GG-K17": [115, 0, 0, 10] });
    expect(result).toMatchObject({
      ok: false,
      error:
        "GG-K17: trả về và mất (125 cái) nhiều hơn số đang ở công trình (120 cái). Kiểm tra lại số đếm.",
    });
    expect(
      await ctx.db
        .select()
        .from(inventoryLedger)
        .where(eq(inventoryLedger.documentType, "RETURN_NOTE")),
    ).toHaveLength(0);
  });

  it("refuses an item never sent to this contract", async () => {
    const result = await returnOf(ctx, fx, { "PK-KU": [20, 0, 0, 0] });
    expect(result).toMatchObject({
      ok: false,
      error: `PK-KU không có ở công trình của hợp đồng ${fx.deal.code}. Hàng của hợp đồng khác cần lập phiếu thu hồi riêng.`,
    });
  });

  it("counts a delivery posted while the storekeeper counted", async () => {
    await deliverMore(ctx, fx, fx.deal.id, [["GG-K17", "GOOD", 10]]);
    const result = await returnOf(ctx, fx, { "GG-K17": [130, 0, 0, 0] });
    expect(result.ok).toBe(true);
  });

  it("refuses a sale contract, an approved contract and a workshop", async () => {
    const sale = await approvedKgSale(ctx, fx);
    expect(
      await returnOf(
        ctx,
        fx,
        { "GG-K17": [1, 0, 0, 0] },
        { body: { contractId: sale.id } },
      ),
    ).toMatchObject({
      ok: false,
      error: "Chỉ thu hồi được hàng của hợp đồng thuê đang thực hiện",
    });
    const [workshop] = await ctx.db
      .select({ id: location.id })
      .from(location)
      .where(eq(location.code, "XUONG-01"));
    expect(
      await returnOf(
        ctx,
        fx,
        { "GG-K17": [1, 0, 0, 0] },
        { body: { yardLocationId: workshop?.id } },
      ),
    ).toMatchObject({
      ok: false,
      status: 422,
      error: "Hàng thu hồi phải về một bãi. Chọn bãi nhận hàng.",
      field: "yardLocationId",
    });
    await ctx.db
      .update(contract)
      .set({ status: "APPROVED" })
      .where(eq(contract.id, fx.deal.id));
    expect(await returnOf(ctx, fx, { "GG-K17": [1, 0, 0, 0] })).toMatchObject({
      ok: false,
      error: "Chỉ thu hồi được hàng của hợp đồng thuê đang thực hiện",
    });
  });

  it("refuses a role without the return permission", async () => {
    expect(
      await returnOf(ctx, fx, { "GG-K17": [1, 0, 0, 0] }, { actor: fx.sales }),
    ).toMatchObject({ ok: false, status: 403 });
  });
});

describe("postReturn: date and resends", () => {
  it("takes the day it reached the server, keeping the phone time apart", async () => {
    const result = await returnOf(
      ctx,
      fx,
      { "GG-CH": [10, 0, 0, 0] },
      {
        now: new Date("2026-11-06T00:10:00Z"),
        body: { savedOnDeviceAt: "2026-11-05T14:50:00Z" },
      },
    );
    expect(result).toMatchObject({
      ok: true,
      data: { businessDate: "2026-11-06" },
    });
    const [row] = await ctx.db.select().from(returnNote);
    expect(row?.savedOnDeviceAt?.toISOString()).toBe(
      "2026-11-05T14:50:00.000Z",
    );
  });

  it("answers a resent draft with the same note and writes nothing more", async () => {
    await setScrap(7_500);
    const draftId = randomUUID();
    const first = await returnOf(ctx, fx, D1, { draftId });
    const again = await returnOf(ctx, fx, D1, { draftId });
    expect(again).toMatchObject({
      ok: true,
      data: {
        code: "PTH-2026-001",
        compensationCode: "ĐB-2026-001",
        replayed: true,
      },
    });
    expect(first.ok && first.data.replayed).toBe(false);
    expect(await ledgerOf("PTH-2026-001")).toHaveLength(6);
    expect(await ctx.db.select().from(compensationNote)).toHaveLength(1);
    const logs = await activityRows(ctx.db);
    expect(
      logs.filter((row) => row.documentCode === "PTH-2026-001"),
    ).toHaveLength(1);
    expect(
      logs.filter((row) => row.documentCode === "ĐB-2026-001"),
    ).toHaveLength(1);
  });

  it("refuses a draft id used by someone else", async () => {
    const draftId = randomUUID();
    await returnOf(ctx, fx, { "GG-CH": [1, 0, 0, 0] }, { draftId });
    expect(
      await returnOf(
        ctx,
        fx,
        { "GG-CH": [1, 0, 0, 0] },
        { draftId, actor: fx.director },
      ),
    ).toMatchObject({
      ok: false,
      status: 409,
      error: "Mã nháp này đã dùng cho một phiếu khác.",
    });
  });

  it("lets only one of two notes through when together they are too many", async () => {
    const send = (db: typeof ctx.db) =>
      postReturn(
        db,
        fx.warehouse,
        {
          clientDraftId: randomUUID(),
          contractId: fx.deal.id,
          yardLocationId: fx.yard,
          lines: [{ itemId: fx.item("GG-K17"), good: "70" }],
        },
        { now: RETURN_NOW },
      );
    const results = await Promise.all([send(ctx.db), send(other.db)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({
      error:
        "GG-K17: trả về và mất (70 cái) nhiều hơn số đang ở công trình (50 cái). Kiểm tra lại số đếm.",
    });
  });

  it("posts the same draft sent twice at once only once", async () => {
    const draftId = randomUUID();
    const body = {
      clientDraftId: draftId,
      contractId: fx.deal.id,
      yardLocationId: fx.yard,
      lines: [{ itemId: fx.item("GG-CH"), good: "5" }],
    };
    const results = await Promise.all([
      postReturn(ctx.db, fx.warehouse, body, { now: RETURN_NOW }),
      postReturn(other.db, fx.warehouse, body, { now: RETURN_NOW }),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(await ctx.db.select().from(returnNote)).toHaveLength(1);
  });

  it("keeps returns and deliveries of a contract in turn", async () => {
    await Promise.all([
      returnOf(ctx, fx, { "GG-CH": [60, 0, 0, 0] }),
      deliverMore(ctx, fx, fx.deal.id, [["GG-CH", "GOOD", 40]], RETURN_NOW),
    ]);
    expect((await onSiteByItem(ctx.db, fx.deal.id)).get(fx.item("GG-CH"))).toBe(
      240_000,
    );
  });
});

describe("postReturn: compensation note", () => {
  it("makes one pending note priced from the contract", async () => {
    await setScrap(7_500);
    const result = await returnOf(ctx, fx, D1);
    expect(result).toMatchObject({
      ok: true,
      data: { compensationCode: "ĐB-2026-001" },
    });
    const [note] = await ctx.db.select().from(compensationNote);
    expect(note).toMatchObject({
      status: "PENDING",
      contractId: fx.deal.id,
      amountDue: null,
    });
    const lines = await ctx.db
      .select()
      .from(compensationNoteLine)
      .where(eq(compensationNoteLine.noteId, note?.id ?? ""));
    expect(
      lines
        .map((line) => [line.kind, milli(line.quantity) / 1000, line.unitPrice])
        .sort(),
    ).toEqual(
      [
        ["DAMAGED", 15, 60_000],
        ["LOST", 2, 350_000],
        ["SCRAPPED", 3, 350_000],
      ].sort(),
    );
  });

  it("makes none when everything came back good", async () => {
    await returnOf(ctx, fx, { "GG-CH": [50, 0, 0, 0] });
    expect(await ctx.db.select().from(compensationNote)).toHaveLength(0);
    const counters = await ctx.db.select().from(documentCounter);
    expect(counters.find((row) => row.prefix === "ĐB")).toBeUndefined();
  });

  it("prices from the revision in force on the return date", async () => {
    const draft = await createAmendment(ctx.db, fx.sales, fx.deal.id, {
      today: "2026-11-01" as BusinessDate,
    });
    if (!draft.ok) throw new Error(draft.error);
    const body = d5Rental(fx);
    const saved = await updateAmendment(
      ctx.db,
      fx.sales,
      fx.deal.id,
      draft.data.number,
      {
        ...body,
        compensations: [{ itemId: fx.item("GG-K17"), lostPrice: 480_000 }],
        effectiveFrom: "2026-11-05",
        reason: "Tăng giá đền",
        updatedAt: draft.data.updatedAt,
      },
    );
    if (!saved.ok) throw new Error(saved.error);
    await submitAmendment(ctx.db, fx.sales, fx.deal.id, draft.data.number);
    const done = await approveAmendment(
      ctx.db,
      fx.director,
      fx.deal.id,
      draft.data.number,
      null,
    );
    if (!done.ok) throw new Error(done.error);

    await returnOf(
      ctx,
      fx,
      { "GG-K17": [0, 0, 0, 2] },
      { now: new Date("2026-11-04T03:00:00Z") },
    );
    await returnOf(ctx, fx, { "GG-K17": [0, 0, 0, 2] });
    const prices = await ctx.db
      .select({
        code: compensationNote.code,
        price: compensationNoteLine.unitPrice,
      })
      .from(compensationNoteLine)
      .innerJoin(
        compensationNote,
        eq(compensationNote.id, compensationNoteLine.noteId),
      )
      .orderBy(compensationNote.code);
    expect(prices).toEqual([
      { code: "ĐB-2026-001", price: 350_000 },
      { code: "ĐB-2026-002", price: 480_000 },
    ]);
  });

  it("leaves the price empty when the contract has none", async () => {
    // A rental whose compensation of GG-CH was cleared.
    const draft = await createAmendment(ctx.db, fx.sales, fx.deal.id, {
      today: "2026-11-01" as BusinessDate,
    });
    if (!draft.ok) throw new Error(draft.error);
    const saved = await updateAmendment(
      ctx.db,
      fx.sales,
      fx.deal.id,
      draft.data.number,
      {
        ...d5Rental(fx),
        compensations: [{ itemId: fx.item("GG-CH"), damagePrice: null }],
        effectiveFrom: "2026-11-05",
        reason: "Bỏ giá hỏng chéo",
        updatedAt: draft.data.updatedAt,
      },
    );
    if (!saved.ok) throw new Error(saved.error);
    await submitAmendment(ctx.db, fx.sales, fx.deal.id, draft.data.number);
    await approveAmendment(
      ctx.db,
      fx.director,
      fx.deal.id,
      draft.data.number,
      null,
    );
    await returnOf(ctx, fx, { "GG-CH": [0, 5, 0, 0] });
    const [line] = await ctx.db.select().from(compensationNoteLine);
    expect(line).toMatchObject({
      kind: "DAMAGED",
      unitPrice: null,
      contractPrice: null,
    });
  });
});
