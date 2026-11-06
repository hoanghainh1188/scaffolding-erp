// Cost and losses from the ledger (management-reports tasks 3.3; spec
// gross-profit; design D1, D2; 0.2 #111–#113). Documents go through the
// app's services; the stocktake and the value correction are written with
// postMovements under their document types (their services are tested in
// their own changes).
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { inventoryLedger, returnNote } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import {
  ledgerCostCheck,
  monthlyProfit,
  sumMonths,
} from "@/domain/gross-profit";
import { STOCKTAKE_DOCUMENT_TYPE } from "@/domain/stocktake";
import { approveBuyBack, createBuyBack } from "@/lib/buy-backs/service";
import {
  approveAdjustment,
  createAdjustment,
  submitAdjustment,
} from "@/lib/inventory/adjustments";
import { postMovements } from "@/lib/inventory/post";
import { createRepairDraft, postRepairOrder } from "@/lib/repairs/orders";
import { setScrapPrice } from "@/lib/receiving/scrap-price";
import { returnDetail } from "@/lib/returns/queries";
import { createTestContext } from "@/test/auth";
import {
  deliveredSale,
  setupReceivableFixture,
  type ReceivableFixture,
} from "@/test/receivables";
import { returnOf } from "@/test/returns";
import { setupSiteFixture, SITE_NOW } from "@/test/site-operations";

import { ledgerSums, repairSums } from "./costs";

const ctx = createTestContext();
afterAll(ctx.close);

const d = (value: string) => value as BusinessDate;
const NOVEMBER = { from: d("2026-11-01"), to: d("2026-11-30") };
const NOV_6 = d("2026-11-06");

async function costsOf(range = NOVEMBER) {
  const [ledger, repairs] = await Promise.all([
    ledgerSums(ctx.db, range),
    repairSums(ctx.db, range),
  ]);
  const months = ["2026-11"];
  const rows = monthlyProfit(months, new Map(), ledger, repairs, new Set());
  return { ledger, repairs, total: sumMonths(rows, months) };
}

async function valueOf(code: string) {
  const rows = await ctx.db
    .select({ amount: inventoryLedger.amount })
    .from(inventoryLedger)
    .where(eq(inventoryLedger.documentCode, code));
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

describe("cost lines of a month", () => {
  let fx: ReceivableFixture;
  beforeEach(async () => {
    fx = await setupReceivableFixture(ctx);
    // Cheaper Chờ sửa and Phế liệu prices, and a scrap price.
    const price = await setScrapPrice(ctx.db, fx.director, {
      pricePerKg: 7_500,
    });
    if (!price.ok) throw new Error(price.error);
    await ctx.db.transaction((tx) =>
      postMovements(
        tx,
        fx.director,
        {
          documentType: "OPENING",
          documentId: null,
          documentCode: "TĐK-2026-009",
          businessDate: d("2026-11-01"),
          lines: (["NEEDS_REPAIR", "SCRAP"] as const).map((condition) => ({
            itemId: fx.item("GG-K17"),
            condition,
            locationId: fx.yard,
            movement: "OPENING" as const,
            quantityMilli: 1_000,
            amount: condition === "SCRAP" ? 60_000 : 100_000,
            description: "Tồn đầu kỳ",
          })),
        },
        d("2026-11-01"),
      ),
    );
  });

  it("takes the write-down and the loss of a return as on the note", async () => {
    const posted = await returnOf(ctx, fx, { "GG-K17": [70, 10, 4, 2] });
    if (!posted.ok) throw new Error(posted.error);
    const [note] = await ctx.db.select().from(returnNote);
    const detail = await returnDetail(ctx.db, fx.accountant, note?.code ?? "", {
      withValues: true,
    });
    if (!detail.ok) throw new Error(detail.error);
    const { total } = await costsOf();
    expect(total.costs.returnWriteDown).toBe(detail.data.values?.conditionLoss);
    expect(total.costs.loss).toBe(detail.data.values?.lostValue);
    expect(total.costs.returnWriteDown).toBeGreaterThan(0);
    expect(total.costs.loss).toBeGreaterThan(0);
  });

  it("takes the cost of goods sold from the sale's ledger lines", async () => {
    const sale = await deliveredSale(
      ctx,
      fx,
      {},
      new Date("2026-11-05T03:00:00Z"),
    );
    const { total } = await costsOf();
    expect(total.costs.sale).toBe(-(await valueOf(sale.code)));
    expect(total.costs.sale).toBeGreaterThan(0);
    expect(total.costs.buyBack).toBe(0);
  });

  it("takes the damage loss only, the repair cost stays in stock (0.2 #111)", async () => {
    const posted = await returnOf(ctx, fx, { "GG-K17": [0, 10, 0, 0] });
    if (!posted.ok) throw new Error(posted.error);
    const draft = await createRepairDraft(
      ctx.db,
      fx.accountant,
      {
        repairDate: NOV_6,
        repairedBy: "Tổ anh Bảy",
        fromLocationId: fx.yard,
        toLocationId: fx.yard,
        lines: [
          {
            itemId: fx.item("GG-K17"),
            quantityTaken: "10",
            quantityGood: "10",
            quantityScrap: "0",
            repairCost: 500_000,
          },
        ],
      },
      NOV_6,
    );
    if (!draft.ok) throw new Error(draft.error);
    const done = await postRepairOrder(
      ctx.db,
      fx.accountant,
      draft.data.code,
      {},
      NOV_6,
    );
    if (!done.ok) throw new Error(done.error);
    const { ledger, repairs, total } = await costsOf();
    expect(total.costs.repair).toBe(0);
    expect(total.repairSpent).toBe(500_000);
    expect(await valueOf(draft.data.code)).toBe(500_000);
    expect(ledgerCostCheck(ledger, repairs)).toBe(total.costTotal);
  });

  it("puts a condition fix with the count line, not the value correction", async () => {
    const draft = await createAdjustment(
      ctx.db,
      fx.accountant,
      {
        kind: "ADJUSTMENT",
        reason: "Sửa sai tình trạng",
        lines: [
          {
            lineType: "CONDITION",
            itemId: fx.item("GG-K17"),
            condition: "GOOD",
            toCondition: "NEEDS_REPAIR",
            locationId: fx.yard,
            quantity: "5",
          },
        ],
      },
      NOV_6,
    );
    if (!draft.ok) throw new Error(draft.error);
    const sent = await submitAdjustment(ctx.db, fx.accountant, draft.data.id);
    if (!sent.ok) throw new Error(sent.error);
    const done = await approveAdjustment(
      ctx.db,
      fx.director,
      draft.data.id,
      NOV_6,
    );
    if (!done.ok) throw new Error(done.error);
    const before = await costsOf();
    const fixed = -(await valueOf(draft.data.code));
    expect(fixed).toBeGreaterThan(0);
    expect(before.total.costs.countAdjust).toBe(fixed);
    await ctx.db.transaction((tx) =>
      postMovements(
        tx,
        fx.director,
        {
          documentType: STOCKTAKE_DOCUMENT_TYPE,
          documentId: null,
          documentCode: "KK-2026-009",
          businessDate: NOV_6,
          lines: [
            {
              itemId: fx.item("GG-CH"),
              condition: "GOOD",
              locationId: fx.yard,
              movement: "ADJUST_OUT",
              quantityMilli: -3_000,
              description: "Kiểm kê thiếu",
            },
          ],
        },
        NOV_6,
      ),
    );
    await ctx.db.transaction((tx) =>
      postMovements(
        tx,
        fx.director,
        {
          documentType: "REVALUE",
          documentId: null,
          documentCode: "ĐCG-2026-009",
          businessDate: NOV_6,
          lines: [
            {
              itemId: fx.item("GG-K17"),
              condition: "GOOD",
              locationId: null,
              movement: "REVALUE",
              quantityMilli: 0,
              amount: 1_200_000,
              description: "Sửa chi phí chuyến",
            },
          ],
        },
        NOV_6,
      ),
    );
    const after = await costsOf();
    expect(after.total.costs.countAdjust).toBe(
      before.total.costs.countAdjust - (await valueOf("KK-2026-009")),
    );
    expect(after.total.costTotal - before.total.costTotal).toBe(
      -(await valueOf("KK-2026-009")),
    );
    expect(ledgerCostCheck(after.ledger, after.repairs)).toBe(
      after.total.costTotal,
    );
  });

  it("leaves out deliveries, opening stock and purchases", async () => {
    // The fixture stocked the yard and delivered to the site in November.
    const { ledger, repairs, total } = await costsOf();
    expect(ledger.some((row) => row.movement === "DELIVERY_OUT")).toBe(true);
    expect(total.costTotal).toBe(0);
    expect(ledgerCostCheck(ledger, repairs)).toBe(0);
  });

  it("reads nothing outside the range", async () => {
    const posted = await returnOf(ctx, fx, { "GG-K17": [0, 0, 0, 2] });
    if (!posted.ok) throw new Error(posted.error);
    const { total } = await costsOf({
      from: d("2026-12-01"),
      to: d("2026-12-31"),
    });
    expect(total.costTotal).toBe(0);
  });
});

describe("buy-back", () => {
  it("takes the cost of what the customer bought back", async () => {
    const fx = await setupSiteFixture(ctx);
    const saved = await createBuyBack(
      ctx.db,
      fx.sales,
      {
        contractId: fx.from.id,
        reason: "Đã đổ bê tông",
        lines: [{ itemId: fx.item("GG-CH"), quantity: "20" }],
      },
      { now: SITE_NOW },
    );
    if (!saved.ok) throw new Error(saved.error);
    const approved = await approveBuyBack(
      ctx.db,
      fx.director,
      saved.data.id,
      {},
      { now: new Date("2026-11-06T03:00:00Z") },
    );
    if (!approved.ok) throw new Error(approved.error);
    const { ledger, repairs, total } = await costsOf();
    expect(total.costs.buyBack).toBe(-(await valueOf(saved.data.code)));
    expect(total.costs.buyBack).toBeGreaterThan(0);
    expect(ledgerCostCheck(ledger, repairs)).toBe(total.costTotal);
  });
});
