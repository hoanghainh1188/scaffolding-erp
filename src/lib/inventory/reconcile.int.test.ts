import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { inventoryCost } from "@/db/schema";
import { toBusinessDate } from "@/domain/business-date";
import { createTestContext } from "@/test/auth";
import { setupInventoryFixture, type InventoryFixture } from "@/test/inventory";

import { postMovements } from "./post";
import { reconcileInventory } from "./reconcile";
import { seedInventory } from "./sample";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: InventoryFixture;
beforeEach(async () => {
  fx = await setupInventoryFixture(ctx);
  await seedInventory(ctx.db, fx.director);
});

const k17Good = () =>
  and(
    eq(inventoryCost.itemId, fx.item("GG-K17")),
    eq(inventoryCost.condition, "GOOD"),
  );

describe("reconcileInventory", () => {
  it("finds nothing after the sample postings", async () => {
    expect(await reconcileInventory(ctx.db)).toEqual([]);
  });

  it("reports a hand-edited average", async () => {
    await ctx.db
      .update(inventoryCost)
      .set({ avgCost: 196_000 })
      .where(k17Good());
    expect(await reconcileInventory(ctx.db)).toEqual([
      "GG-K17 Tốt: giá BQ 196.000 ₫, sổ kho 195.282 ₫",
    ]);
  });

  it("reports a hand-edited quantity", async () => {
    await ctx.db
      .update(inventoryCost)
      .set({ poolQuantity: "3400" })
      .where(k17Good());
    expect(await reconcileInventory(ctx.db)).toEqual([
      "GG-K17 Tốt: tồn 3.400 cái, sổ kho 3.410 cái",
    ]);
  });

  it("finds nothing right after a REVALUE line, then catches a hand edit", async () => {
    await ctx.db.transaction((tx) =>
      postMovements(tx, fx.director, {
        documentType: "REVALUE",
        documentId: null,
        documentCode: "ĐCG-2026-001",
        businessDate: toBusinessDate(new Date()),
        lines: [
          {
            itemId: fx.item("GG-K17"),
            condition: "GOOD",
            locationId: null,
            movement: "REVALUE",
            quantityMilli: 0,
            amount: -4_126_000,
            description: "Giảm giá trị 4.126.000 ₫ · sửa PN-2026-087",
          },
        ],
      }),
    );
    const [row] = await ctx.db
      .select({ avg: inventoryCost.avgCost })
      .from(inventoryCost)
      .where(k17Good());
    // 3.410 × 195.282 − 4.126.000 = 661.785.620 ÷ 3.410 = 194.072,07
    expect(row?.avg).toBe(194_072);
    expect(await reconcileInventory(ctx.db)).toEqual([]);
    await ctx.db
      .update(inventoryCost)
      .set({ avgCost: 195_282 })
      .where(k17Good());
    expect(await reconcileInventory(ctx.db)).toEqual([
      "GG-K17 Tốt: giá BQ 195.282 ₫, sổ kho 194.072 ₫",
    ]);
  });
});
