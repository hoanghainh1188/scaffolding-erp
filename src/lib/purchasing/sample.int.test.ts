// Sample orders (purchase-orders task 3.6, design D13).
import { afterAll, beforeEach, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";
import { createTestContext } from "@/test/auth";
import {
  setupPurchasingFixture,
  type PurchasingFixture,
} from "@/test/purchasing";

import { getOrderByCode, listOrders } from "./queries";
import { sampleD3OrderCode, seedPurchasing } from "./sample";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: PurchasingFixture;
beforeEach(async () => {
  fx = await setupPurchasingFixture(ctx);
});

it("creates the five sample orders once, the D3 one with its totals", async () => {
  const now = new Date("2026-10-26T03:00:00Z");
  expect(await seedPurchasing(ctx.db, fx.director, now)).toBe(5);
  expect(await seedPurchasing(ctx.db, fx.director, now)).toBe(0);
  const code = await sampleD3OrderCode(ctx.db);
  const order = code ? await getOrderByCode(ctx.db, code) : null;
  expect(order?.totals.total).toBe(85_808_750);
  const list = await listOrders(ctx.db, {}, "2026-10-26" as BusinessDate);
  expect(list.counts).toMatchObject({ all: 5, draft: 1, waiting: 3 });
  expect(list.arrivingToday).toBe(2);
});
