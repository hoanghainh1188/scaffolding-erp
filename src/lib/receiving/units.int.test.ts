// Receiving metres and bundles (catalog-extensions task 3.2, design D2): the
// ledger takes the quantity in the item unit, trip costs split by kg.
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { goodsReceiptLine, inventoryLedger, item } from "@/db/schema";
import { PURCHASE_MESSAGES } from "@/domain/purchase-order";
import { reconcileInventory } from "@/lib/inventory/reconcile";
import { createTestContext } from "@/test/auth";
import { insertMeterAndBundleItems } from "@/test/purchasing";
import {
  counted,
  OCT_26,
  orderLineIds,
  placedOrder,
  setupReceivingFixture,
  type ReceivingFixture,
} from "@/test/receiving";

import type { OrderBody } from "../purchasing/orders";
import type { ReceiptBody } from "./body";
import { postReceipt } from "./post";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: ReceivingFixture;
let items: { ong: string; ty: string };
beforeEach(async () => {
  fx = await setupReceivingFixture(ctx);
  items = await insertMeterAndBundleItems(ctx);
});

function order(
  kind: "NEW" | "USED",
  lines: OrderBody["lines"],
  costs: number,
): OrderBody {
  return {
    supplierId: fx.supplier(kind === "NEW" ? "NCC-0001" : "NCC-0002"),
    kind,
    expectedDate: "2026-10-26",
    allocationMethod: "WEIGHT",
    lines,
    costs: [{ label: "Cước xe tải", amount: costs }],
  };
}

function trip(
  code: string,
  lines: ReceiptBody["lines"],
  costs: number,
): ReceiptBody {
  return {
    draftId: crypto.randomUUID(),
    orderCode: code,
    arrivedAt: "2026-10-26T02:34:00Z",
    lines,
    costs: [{ label: "Cước xe tải", amount: costs }],
    confirmedOverrides: [],
  };
}

async function ledgerRows() {
  return (
    await ctx.db
      .select({
        itemCode: item.code,
        condition: inventoryLedger.condition,
        movement: inventoryLedger.movement,
        quantity: inventoryLedger.quantity,
        amount: inventoryLedger.amount,
      })
      .from(inventoryLedger)
      .innerJoin(item, eq(item.id, inventoryLedger.itemId))
      .orderBy(asc(inventoryLedger.id))
  ).map((row) => [
    row.itemCode,
    row.movement,
    row.condition,
    row.quantity,
    row.amount,
  ]);
}

describe("one trip of ONG-49 (m) and TY-REN (bó)", () => {
  it("books PURCHASE_IN in the item unit with costs split by kg", async () => {
    const code = await placedOrder(
      ctx,
      fx,
      order(
        "NEW",
        [
          {
            itemId: items.ong,
            unit: "METER",
            quantity: "120.5",
            unitPrice: 60_000,
          },
          {
            itemId: items.ty,
            unit: "BUNDLE",
            quantity: "40",
            unitPrice: 400_000,
          },
        ],
        1_428_980,
      ),
    );
    const lines = await orderLineIds(ctx, code);
    const result = await postReceipt(
      ctx.db,
      fx.warehouse,
      trip(
        code,
        [
          counted(lines.get("ONG-49") ?? "", "120.5", { NEW: "120.5" }),
          counted(lines.get("TY-REN") ?? "", "40", { NEW: "40" }),
        ],
        1_428_980,
      ),
      { now: OCT_26 },
    );
    if (!result.ok) throw new Error(`${result.status} ${result.error}`);
    expect(result.data.orderStatus).toBe("DONE");
    // 120,5 m × 3,56 = 428,98 kg; 40 bó × 25 = 1.000 kg: the costs split
    // 428.980 / 1.000.000 on top of 7.230.000 and 16.000.000.
    expect(await ledgerRows()).toEqual([
      ["ONG-49", "PURCHASE_IN", "NEW", "120.500", 7_658_980],
      ["TY-REN", "PURCHASE_IN", "NEW", "40.000", 17_000_000],
    ]);
    expect(await reconcileInventory(ctx.db)).toEqual([]);
  });

  it("weighs a TY-REN kg line and splits a used lot of metres", async () => {
    const code = await placedOrder(
      ctx,
      fx,
      order(
        "USED",
        [
          {
            itemId: items.ty,
            unit: "KG",
            quantity: "1000",
            unitPrice: 16_000,
          },
          {
            itemId: items.ong,
            unit: "METER",
            quantity: "50",
            unitPrice: 60_000,
          },
        ],
        1_158_000,
      ),
    );
    const lines = await orderLineIds(ctx, code);
    const tyLine = lines.get("TY-REN") ?? "";
    const body = trip(
      code,
      [
        counted(
          tyLine,
          "39",
          { GOOD: "35", NEEDS_REPAIR: "3", SCRAP: "1" },
          { weighedKg: "980" },
        ),
        counted(lines.get("ONG-49") ?? "", "50", {
          GOOD: "45.5",
          SCRAP: "4.5",
        }),
      ],
      1_158_000,
    );
    const unweighed = await postReceipt(
      ctx.db,
      fx.warehouse,
      {
        ...body,
        lines: body.lines?.map((line, index) =>
          index === 0 ? { ...line, weighedKg: null } : line,
        ),
      },
      { now: OCT_26 },
    );
    expect(unweighed).toMatchObject({
      ok: false,
      status: 422,
      field: "lines.0.weighedKg",
    });
    const half = await postReceipt(
      ctx.db,
      fx.warehouse,
      {
        ...body,
        draftId: crypto.randomUUID(),
        lines: body.lines?.map((line, index) =>
          index === 0
            ? { ...line, quantity: "38.5", split: { GOOD: "38.5" } }
            : line,
        ),
      },
      { now: OCT_26 },
    );
    expect(half).toMatchObject({
      ok: false,
      status: 422,
      error: PURCHASE_MESSAGES.wholePieces("TY-REN", "bó"),
    });

    const result = await postReceipt(ctx.db, fx.warehouse, body, {
      now: OCT_26,
    });
    if (!result.ok) throw new Error(`${result.status} ${result.error}`);
    // Weights: TY-REN 980 kg weighed, ONG-49 50 m × 3,56 = 178 kg, so the
    // costs split 980.000 / 178.000. Scrap takes kg × 7.500 ₫: 1 bó = 25 kg
    // → 187.500; 4,5 m = 16,02 kg → 120.150. The rest goes by count.
    expect(await ledgerRows()).toEqual([
      ["TY-REN", "PURCHASE_IN", "GOOD", "35.000", 15_172_039],
      ["TY-REN", "PURCHASE_IN", "NEEDS_REPAIR", "3.000", 1_300_461],
      ["TY-REN", "PURCHASE_IN", "SCRAP", "1.000", 187_500],
      ["ONG-49", "PURCHASE_IN", "GOOD", "45.500", 3_057_850],
      ["ONG-49", "PURCHASE_IN", "SCRAP", "4.500", 120_150],
    ]);
    const [saved] = await ctx.db
      .select({
        quantity: goodsReceiptLine.quantity,
        weighedKg: goodsReceiptLine.weighedKg,
      })
      .from(goodsReceiptLine)
      .where(eq(goodsReceiptLine.orderLineId, tyLine));
    expect(saved).toEqual({ quantity: "39.000", weighedKg: "980.000" });
    expect(await reconcileInventory(ctx.db)).toEqual([]);
  });
});
