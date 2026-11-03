// Sample return note (returns-and-compensation tasks 7.1).
import { afterAll, beforeEach, expect, it } from "vitest";

import { compensationNote, returnNote, returnPhoto } from "@/db/schema";
import { createTestContext } from "@/test/auth";
import { setupContractFixture, type ContractFixture } from "@/test/contracts";
import { seedContracts } from "@/lib/contracts/sample";
import { seedDeliveries } from "@/lib/deliveries/sample";
import { reconcileInventory } from "@/lib/inventory/reconcile";
import { seedInventory } from "@/lib/inventory/sample";

import { seedReturns } from "./sample";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: ContractFixture;
beforeEach(async () => {
  fx = await setupContractFixture(ctx);
});

it("posts one return with photos and a pending compensation note, once", async () => {
  await seedInventory(ctx.db, fx.director);
  await seedContracts(ctx.db, { director: fx.director, sales: fx.sales });
  await seedDeliveries(ctx.db, { sales: fx.sales, warehouse: fx.warehouse });
  expect(await seedReturns(ctx.db, { warehouse: fx.warehouse })).toBe(1);
  expect(await seedReturns(ctx.db, { warehouse: fx.warehouse })).toBe(0);
  expect(await ctx.db.select().from(returnNote)).toHaveLength(1);
  expect(
    (await ctx.db.select().from(returnPhoto)).every(
      (row) => row.returnNoteId !== null,
    ),
  ).toBe(true);
  const [note] = await ctx.db.select().from(compensationNote);
  expect(note?.status).toBe("PENDING");
  expect(await reconcileInventory(ctx.db)).toEqual([]);
});
