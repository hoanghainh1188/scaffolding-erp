// Sample repair slip (simple-repair task 7.1, design D13).
import { afterAll, beforeEach, expect, it } from "vitest";

import { reconcileInventory } from "@/lib/inventory/reconcile";
import { seedInventory } from "@/lib/inventory/sample";
import { createTestContext } from "@/test/auth";
import {
  resetInventoryTables,
  setupInventoryFixture,
  type InventoryFixture,
} from "@/test/inventory";

import { getRepairOrder, listRepairOrders } from "./queries";
import { seedRepairs } from "./sample";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: InventoryFixture;
beforeEach(async () => {
  fx = await setupInventoryFixture(ctx);
  await resetInventoryTables(ctx);
  await seedInventory(ctx.db, fx.director);
});

it("adds one D12 draft after PSC-2026-021, once", async () => {
  const now = new Date("2026-10-28T03:00:00Z");
  expect(await seedRepairs(ctx.db, fx.accountant, now)).toBe(1);
  expect(await seedRepairs(ctx.db, fx.accountant, now)).toBe(0);
  const rows = await listRepairOrders(ctx.db);
  expect(rows.map((row) => row.code)).toEqual(["PSC-2026-022"]);
  expect(rows[0]).toMatchObject({ status: "DRAFT", cost: 2_220_000 });
  const slip = await getRepairOrder(ctx.db, "PSC-2026-022");
  expect(slip?.lines.map((line) => line.itemCode)).toEqual(["GG-K17", "GG-CH"]);
  expect(await reconcileInventory(ctx.db)).toEqual([]);
});
