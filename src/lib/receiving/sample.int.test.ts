// Sample receipts (goods-receipt task 10.1, design D14).
import { afterAll, beforeEach, expect, it } from "vitest";

import { getOrderByCode } from "@/lib/purchasing/queries";
import { reconcileInventory } from "@/lib/inventory/reconcile";
import { seedPurchasing } from "@/lib/purchasing/sample";
import {
  receivingOf,
  waitingOf,
} from "@/components/purchasing/order-receiving";
import { createTestContext } from "@/test/auth";
import { setupReceivingFixture, type ReceivingFixture } from "@/test/receiving";

import { receiptsOfOrder } from "./queries";
import { sampleReceivingOrderCode, seedReceiving } from "./sample";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: ReceivingFixture;
beforeEach(async () => {
  fx = await setupReceivingFixture(ctx, { scrapPrice: false });
});

it("posts two sample trips once, leaving an order waiting like D3b", async () => {
  const now = new Date("2026-10-26T03:00:00Z");
  await seedPurchasing(ctx.db, fx.director, now);
  const actors = { director: fx.director, warehouse: fx.warehouse };
  expect(await seedReceiving(ctx.db, actors, now)).toBe(2);
  expect(await seedReceiving(ctx.db, actors, now)).toBe(0);
  const code = await sampleReceivingOrderCode(ctx.db);
  const order = code ? await getOrderByCode(ctx.db, code) : null;
  if (!order) throw new Error("no sample order");
  expect(order).toMatchObject({ status: "IN_PROGRESS", trips: 2 });
  const trips = await receiptsOfOrder(ctx.db, order.id);
  expect(trips.map((trip) => trip.code)).toEqual([
    "PN-2026-090",
    "PN-2026-091",
  ]);
  const summary = receivingOf(order.lines, trips, order.totals.costs);
  expect(summary.payable).toBe(54_942_500);
  expect(summary.actualCosts).toBe(2_300_000);
  expect(waitingOf(summary, order.lines)).toBe("40 mâm giàn giáo 1,6m");
  expect(await reconcileInventory(ctx.db)).toEqual([]);
});
