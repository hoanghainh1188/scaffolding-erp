// Sample delivery notes (deliveries tasks 7.1).
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { contract, deliveryNote } from "@/db/schema";
import { createTestContext } from "@/test/auth";
import { setupContractFixture, type ContractFixture } from "@/test/contracts";
import { seedContracts } from "@/lib/contracts/sample";
import { reconcileInventory } from "@/lib/inventory/reconcile";
import { seedInventory } from "@/lib/inventory/sample";

import { seedDeliveries } from "./sample";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: ContractFixture;
beforeEach(async () => {
  fx = await setupContractFixture(ctx);
});

it("posts Đợt 1 and plans Đợt 2 once, the ledger still reconciling", async () => {
  await seedInventory(ctx.db, fx.director);
  await seedContracts(ctx.db, { director: fx.director, sales: fx.sales });
  const people = { sales: fx.sales, warehouse: fx.warehouse };
  expect(await seedDeliveries(ctx.db, people)).toBe(2);
  expect(await seedDeliveries(ctx.db, people)).toBe(0);
  const notes = await ctx.db
    .select({
      status: deliveryNote.status,
      batchNo: deliveryNote.batchNo,
      contractId: deliveryNote.contractId,
    })
    .from(deliveryNote)
    .orderBy(deliveryNote.batchNo);
  expect(notes.map((row) => [row.batchNo, row.status])).toEqual([
    [1, "POSTED"],
    [2, "PLANNED"],
  ]);
  const [deal] = await ctx.db
    .select({ status: contract.status })
    .from(contract)
    .where(eq(contract.id, notes[0]?.contractId ?? ""));
  expect(deal?.status).toBe("ACTIVE");
  expect(await reconcileInventory(ctx.db)).toEqual([]);
});
