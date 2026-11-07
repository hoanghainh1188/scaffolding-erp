// The sample work order of db:seed:dev (repair-work-orders task 9.1): runs
// once, and the order waits to be posted like drawing D12.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { repairOrder } from "@/db/schema";
import { postMovements } from "@/lib/inventory/post";
import { createTestContext, createTestUser } from "@/test/auth";
import { setupInventoryFixture, type InventoryFixture } from "@/test/inventory";
import type { BusinessDate } from "@/domain/business-date";

import { seedWorkOrders } from "./work-sample";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: InventoryFixture;
beforeEach(async () => {
  fx = await setupInventoryFixture(ctx);
  await ctx.db.transaction((tx) =>
    postMovements(
      tx,
      fx.director,
      {
        documentType: "OPENING",
        documentId: null,
        documentCode: "TĐK-2026-001",
        businessDate: "2026-10-01" as BusinessDate,
        lines: [
          ["GG-K17", 201, 160_000],
          ["GG-CH", 63, 30_000],
        ].map(([code, pieces, cost]) => ({
          itemId: fx.item(String(code)),
          condition: "NEEDS_REPAIR" as const,
          locationId: fx.place("BAI-01"),
          movement: "OPENING" as const,
          quantityMilli: Number(pieces) * 1000,
          amount: Number(pieces) * Number(cost),
          description: "Tồn đầu kỳ",
        })),
      },
      "2026-10-01" as BusinessDate,
    ),
  );
});

describe("seedWorkOrders", () => {
  it("adds supplies and one counted order, then nothing on a rerun", async () => {
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
    expect(await seedWorkOrders(ctx.db, actors)).toBe(4);
    expect(await seedWorkOrders(ctx.db, actors)).toBe(0);
    const orders = await ctx.db
      .select({ status: repairOrder.status })
      .from(repairOrder)
      .where(eq(repairOrder.kind, "WORK_ORDER"));
    expect(orders).toEqual([{ status: "COUNTED" }]);
  });
});
