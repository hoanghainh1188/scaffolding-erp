// Buy-back notes (site-operations spec buy-backs; tasks 4.1, 4.2): prices
// prefilled from the contract, approval posts SALE_OUT at the site and stops
// the rent from the approval day, money due for receivables.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { buyBackNote, buyBackNoteLine, inventoryLedger } from "@/db/schema";
import { quantityFromDb } from "@/domain/quantity";
import { onSiteByItem } from "@/lib/deliveries/records";
import { reconcileInventory } from "@/lib/inventory/reconcile";
import { activityRows } from "@/test/activity";
import { createTestContext } from "@/test/auth";
import { returnOf } from "@/test/returns";
import {
  setupSiteFixture,
  SITE_NOW,
  type SiteFixture,
} from "@/test/site-operations";

import {
  approveBuyBack,
  createBuyBack,
  rejectBuyBack,
  updateBuyBack,
  type BuyBackBody,
} from "./service";

const ctx = createTestContext();
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});

let fx: SiteFixture;
beforeEach(async () => {
  fx = await setupSiteFixture(ctx);
});

const K = 1000;
const LATER = new Date("2026-11-06T03:00:00Z");
const milli = (value: string) => quantityFromDb(value, "KG").milli;

const body = (
  counts: Record<string, number>,
  prices: Record<string, number | null> = {},
): BuyBackBody => ({
  contractId: fx.from.id,
  reason: "Ty ren, bát chuồn đã đổ bê tông, không tháo ra được",
  lines: Object.entries(counts).map(([code, count]) => ({
    itemId: fx.item(code),
    quantity: String(count),
    ...(code in prices ? { unitPrice: prices[code] } : {}),
  })),
});

async function made(counts: Record<string, number>, prices = {}) {
  const saved = await createBuyBack(ctx.db, fx.sales, body(counts, prices), {
    now: SITE_NOW,
  });
  if (!saved.ok) throw new Error(saved.error);
  return saved.data;
}

async function onSite(code: string) {
  return ((await onSiteByItem(ctx.db, fx.from.id)).get(fx.item(code)) ?? 0) / K;
}

async function linesOf(id: string) {
  return ctx.db
    .select()
    .from(buyBackNoteLine)
    .where(eq(buyBackNoteLine.noteId, id))
    .orderBy(buyBackNoteLine.lineNo);
}

describe("making a buy-back", () => {
  it("prefills the lost price of the contract and writes no ledger line", async () => {
    const note = await made({ "GG-CH": 20, "GG-M16": 5 });
    expect(note.status).toBe("PENDING");
    expect(note.code).toBe("MLA-2026-001");
    const lines = await linesOf(note.id);
    expect(lines.map((line) => [line.unitPrice, line.contractPrice])).toEqual([
      [80_000, 80_000],
      [280_000, 280_000],
    ]);
    expect(
      await ctx.db
        .select()
        .from(inventoryLedger)
        .where(eq(inventoryLedger.documentCode, note.code)),
    ).toEqual([]);
    const [log] = await activityRows(ctx.db, note.code);
    expect(log?.action).toBe("CREATE");
    expect(log?.flags ?? []).not.toContain("ANOMALY");
  });

  it("flags a price that differs from the contract", async () => {
    const note = await made({ "GG-CH": 20 }, { "GG-CH": 60_000 });
    const [log] = await activityRows(ctx.db, note.code);
    expect(log?.flags).toContain("ANOMALY");
  });

  it("refuses more than is at the site", async () => {
    const result = await createBuyBack(
      ctx.db,
      fx.sales,
      body({ "GG-CH": 300 }),
      { now: SITE_NOW },
    );
    expect(result).toMatchObject({
      ok: false,
      error:
        "GG-CH: số mua (300 cái) nhiều hơn số đang ở công trình (260 cái).",
    });
  });

  it("needs a reason", async () => {
    const result = await createBuyBack(
      ctx.db,
      fx.sales,
      { ...body({ "GG-CH": 20 }), reason: " " },
      { now: SITE_NOW },
    );
    expect(result).toMatchObject({
      ok: false,
      error: "Bạn ghi lý do khách mua lại.",
    });
  });

  it("refuses sales scoped to sale contracts and the storekeeper", async () => {
    const seller = await fx.seller("thuyvy", "SALE");
    for (const actor of [seller, fx.warehouse]) {
      const result = await createBuyBack(ctx.db, actor, body({ "GG-CH": 1 }), {
        now: SITE_NOW,
      });
      expect(result).toMatchObject({ ok: false, status: 403 });
    }
  });

  it("edits a pending note once, 409 when stale", async () => {
    const note = await made({ "GG-CH": 20 });
    const edited = await updateBuyBack(
      ctx.db,
      fx.sales,
      note.id,
      { ...body({ "GG-CH": 10 }), updatedAt: note.updatedAt },
      { now: LATER },
    );
    expect(edited.ok).toBe(true);
    const stale = await updateBuyBack(
      ctx.db,
      fx.sales,
      note.id,
      { ...body({ "GG-CH": 5 }), updatedAt: note.updatedAt },
      { now: LATER },
    );
    expect(stale).toMatchObject({ ok: false, status: 409 });
    expect(
      (await activityRows(ctx.db, note.code)).map((row) => row.action),
    ).toEqual(["CREATE", "UPDATE"]);
  });
});

describe("approving", () => {
  it("posts SALE_OUT at the site on the approval day and stores the money", async () => {
    const note = await made({ "GG-CH": 20, "GG-M16": 5 });
    const result = await approveBuyBack(
      ctx.db,
      fx.director,
      note.id,
      {},
      { now: LATER },
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        status: "APPROVED",
        amountDue: 20 * 80_000 + 5 * 280_000,
        dueDate: "2026-12-06",
      },
    });
    const lines = await ctx.db
      .select()
      .from(inventoryLedger)
      .where(eq(inventoryLedger.documentCode, note.code));
    expect(
      lines.map((line) => [
        line.movement,
        line.locationId === fx.fromLocation,
        milli(line.quantity) / K,
        line.businessDate,
      ]),
    ).toEqual([
      ["SALE_OUT", true, -20, "2026-11-06"],
      ["SALE_OUT", true, -5, "2026-11-06"],
    ]);
    expect(await onSite("GG-CH")).toBe(240);
    expect(await reconcileInventory(ctx.db)).toEqual([]);
    const rows = await activityRows(ctx.db, note.code);
    expect(rows.map((row) => row.action)).toEqual(["CREATE", "APPROVE"]);
    expect(rows[1]?.summary).toBe("Mua lại 20 chéo, 5 mâm · 3.000.000 ₫");
  });

  it("sells Mới before Tốt", async () => {
    const note = await made({ "GG-K17": 25 });
    await approveBuyBack(ctx.db, fx.director, note.id, {}, { now: LATER });
    const lines = await ctx.db
      .select()
      .from(inventoryLedger)
      .where(eq(inventoryLedger.documentCode, note.code));
    expect(
      lines.map((line) => [line.condition, milli(line.quantity) / K]),
    ).toEqual([
      ["NEW", -20],
      ["GOOD", -5],
    ]);
  });

  it("refuses when the goods went back to the yard meanwhile", async () => {
    const note = await made({ "GG-M16": 20 });
    const back = await returnOf(
      ctx,
      { ...fx, deal: fx.from, siteLocation: fx.fromLocation },
      { "GG-M16": [50, 0, 0, 0] },
      { now: SITE_NOW },
    );
    expect(back.ok).toBe(true);
    const result = await approveBuyBack(
      ctx.db,
      fx.director,
      note.id,
      {},
      { now: LATER },
    );
    expect(result).toMatchObject({
      ok: false,
      error:
        "GG-M16: số mua (20 cái) nhiều hơn số đang ở công trình (10 cái). Kinh doanh cần sửa phiếu.",
    });
    const [row] = await ctx.db
      .select({ status: buyBackNote.status })
      .from(buyBackNote)
      .where(eq(buyBackNote.id, note.id));
    expect(row?.status).toBe("PENDING");
  });

  it("approves once when two approvals meet", async () => {
    const note = await made({ "GG-CH": 20 });
    const [a, b] = await Promise.all([
      approveBuyBack(ctx.db, fx.director, note.id, {}, { now: LATER }),
      approveBuyBack(other.db, fx.director, note.id, {}, { now: LATER }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const loser = a.ok ? b : a;
    expect(loser).toMatchObject({
      ok: false,
      error: "Phiếu MLA-2026-001 đã được duyệt.",
    });
    expect(
      await ctx.db
        .select()
        .from(inventoryLedger)
        .where(eq(inventoryLedger.documentCode, note.code)),
    ).toHaveLength(1);
  });

  it("is the director's only", async () => {
    const note = await made({ "GG-CH": 20 });
    const result = await approveBuyBack(ctx.db, fx.sales, note.id, {});
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("freezes the note once approved", async () => {
    const note = await made({ "GG-CH": 20 });
    const approved = await approveBuyBack(
      ctx.db,
      fx.director,
      note.id,
      {},
      { now: LATER },
    );
    const result = await updateBuyBack(
      ctx.db,
      fx.sales,
      note.id,
      {
        ...body({ "GG-CH": 10 }),
        updatedAt: approved.ok ? approved.data.updatedAt : "",
      },
      { now: LATER },
    );
    expect(result).toMatchObject({
      ok: false,
      error: "Phiếu mua lại đã duyệt nên không sửa được.",
    });
  });
});

describe("rejecting", () => {
  it("needs a reason and leaves the goods on site", async () => {
    const note = await made({ "GG-CH": 20 });
    const blank = await rejectBuyBack(ctx.db, fx.director, note.id, {
      reason: "",
    });
    expect(blank).toMatchObject({
      ok: false,
      error: "Bạn cần ghi lý do từ chối.",
    });
    const result = await rejectBuyBack(ctx.db, fx.director, note.id, {
      reason: "Đục bê tông lấy ra được, cho trả về",
    });
    expect(result).toMatchObject({ ok: true, data: { status: "REJECTED" } });
    expect(await onSite("GG-CH")).toBe(260);
    expect(
      (await activityRows(ctx.db, note.code)).map((row) => row.action),
    ).toEqual(["CREATE", "REJECT"]);
  });
});
