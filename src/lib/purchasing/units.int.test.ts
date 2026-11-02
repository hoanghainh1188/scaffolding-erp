// Purchase orders in the new units (catalog-extensions task 3.1, design D2):
// a line is ordered in the item's own unit or, for an item with a standard
// weight, in kg.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PURCHASE_MESSAGES } from "@/domain/purchase-order";
import { createTestContext } from "@/test/auth";
import {
  insertMeterAndBundleItems,
  insertUnitItem,
  setupPurchasingFixture,
  type PurchasingFixture,
} from "@/test/purchasing";

import { createOrder, type OrderBody } from "./orders";
import { getOrderByCode } from "./queries";

const ctx = createTestContext();
afterAll(ctx.close);

const OCT = new Date("2026-10-26T03:00:00Z");

let fx: PurchasingFixture;
let items: { ong: string; ty: string };
beforeEach(async () => {
  fx = await setupPurchasingFixture(ctx);
  items = await insertMeterAndBundleItems(ctx);
});

function order(lines: OrderBody["lines"]): OrderBody {
  return {
    supplierId: fx.supplier("NCC-0001"),
    kind: "NEW",
    expectedDate: "2026-10-28",
    allocationMethod: "WEIGHT",
    lines,
    costs: [{ label: "Cước xe tải", amount: 3_000_000 }],
  };
}

describe("ordering metres, bundles and their kg", () => {
  it("saves a METER item in m and in kg, and a BUNDLE item", async () => {
    // One METER item can only be on one line (no duplicates), so the kg line
    // uses a second METER item.
    const ong60 = await insertUnitItem(ctx, {
      code: "ONG-60",
      name: "Ống thép phi 60",
      unit: "METER",
      standardWeightKg: "4.500",
    });
    const result = await createOrder(
      ctx.db,
      fx.sales,
      order([
        {
          itemId: items.ong,
          unit: "METER",
          quantity: "120.5",
          unitPrice: 60_000,
        },
        { itemId: ong60, unit: "KG", quantity: "220", unitPrice: 15_000 },
        {
          itemId: items.ty,
          unit: "BUNDLE",
          quantity: "40",
          unitPrice: 400_000,
        },
      ]),
      { place: true, now: OCT },
    );
    if (!result.ok) throw new Error(result.error);
    const saved = await getOrderByCode(ctx.db, result.data.code);
    expect(
      saved?.lines.map((line) => [
        line.itemCode,
        line.itemUnit,
        line.unit,
        line.quantity,
        line.amount,
      ]),
    ).toEqual([
      ["ONG-49", "METER", "METER", 120_500, 7_230_000],
      ["ONG-60", "METER", "KG", 220_000, 3_300_000],
      ["TY-REN", "BUNDLE", "BUNDLE", 40_000, 16_000_000],
    ]);
    expect(saved?.totals.goods).toBe(26_530_000);
    expect(saved?.status).toBe("IN_PROGRESS");
  });

  it("orders a BUNDLE item by kg", async () => {
    const result = await createOrder(
      ctx.db,
      fx.sales,
      order([
        { itemId: items.ty, unit: "KG", quantity: "1000.5", unitPrice: 16_000 },
      ]),
      { now: OCT },
    );
    expect(result.ok).toBe(true);
  });

  it("refuses half a bundle", async () => {
    expect(
      await createOrder(
        ctx.db,
        fx.sales,
        order([
          { itemId: items.ty, unit: "BUNDLE", quantity: "2.5", unitPrice: 1 },
        ]),
        { now: OCT },
      ),
    ).toMatchObject({
      ok: false,
      status: 422,
      error: PURCHASE_MESSAGES.wholePieces("TY-REN", "bó"),
      field: "lines.0.quantity",
    });
  });

  it("refuses a unit that is neither the item unit nor kg", async () => {
    expect(
      await createOrder(
        ctx.db,
        fx.sales,
        order([
          { itemId: items.ong, unit: "PIECE", quantity: "10", unitPrice: 1 },
        ]),
        { now: OCT },
      ),
    ).toMatchObject({
      ok: false,
      status: 422,
      error: PURCHASE_MESSAGES.unitNotAllowed("ONG-49", "m"),
      field: "lines.0.unit",
    });
  });
});
