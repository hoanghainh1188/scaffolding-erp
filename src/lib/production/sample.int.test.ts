// The production sample of db:seed:dev (production-orders task 5.1): runs
// once and leaves an order waiting for the director like drawing D20.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { reconcileInventory } from "@/lib/inventory/reconcile";
import { createTestContext, createTestUser } from "@/test/auth";
import { setupInventoryFixture, type InventoryFixture } from "@/test/inventory";

import { getProductionOrder, listBoms } from "./queries";
import { seedProduction } from "./sample";
import { currentScrapItem } from "./settings";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: InventoryFixture;
beforeEach(async () => {
  fx = await setupInventoryFixture(ctx);
});

describe("seedProduction", () => {
  it("adds the sample once, the order waits for the director", async () => {
    const actors = {
      director: fx.director,
      accountant: fx.accountant,
      workshop: await createTestUser(ctx, {
        role: "WORKSHOP",
        username: "xuong",
      }),
      warehouse: await createTestUser(ctx, {
        role: "WAREHOUSE",
        username: "thukho",
      }),
    };
    expect(await seedProduction(ctx.db, actors)).toBe(9);
    expect(await seedProduction(ctx.db, actors)).toBe(0);
    expect((await listBoms(ctx.db)).map((row) => row.code)).toEqual([
      "GG-CH",
      "GG-K17",
    ]);
    expect((await currentScrapItem(ctx.db))?.code).toBe("PL-SATVUN");
    const order = await getProductionOrder(ctx.db, "LSX-2026-001");
    expect(order?.status).toBe("AWAITING_APPROVAL");
    expect(order?.team).toBe("tổ anh Lực");
    const second = await getProductionOrder(ctx.db, "LSX-2026-002");
    expect(second?.status).toBe("IN_PROGRESS");
    expect(await reconcileInventory(ctx.db)).toEqual([]);
  });
});
