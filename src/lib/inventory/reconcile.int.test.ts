import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { inventoryCost } from "@/db/schema";
import { createTestContext } from "@/test/auth";
import { setupInventoryFixture, type InventoryFixture } from "@/test/inventory";

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
});
