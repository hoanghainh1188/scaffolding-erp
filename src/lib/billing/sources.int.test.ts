// Batched rent sources (dashboard-basic task 3.1): for every contract the
// batch reads exactly what loadBillingSource reads one by one, across a
// return with lost goods, a same-customer transfer, a closed month and an
// adjustment.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createTestContext } from "@/test/auth";
import { closeMonth } from "@/test/billing";
import { returnOf } from "@/test/returns";
import {
  movedNow,
  setupSiteFixture,
  type SiteFixture,
} from "@/test/site-operations";

import { createAdjustment } from "./adjustments";
import { loadBillingSource } from "./compute";
import { loadBillingSources } from "./sources";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: SiteFixture;

beforeEach(async () => {
  fx = await setupSiteFixture(ctx);
});

async function expectSameAsOneByOne(ids: string[]) {
  const batch = await loadBillingSources(ctx.db, ids);
  expect([...batch.keys()].sort()).toEqual([...new Set(ids)].sort());
  for (const id of ids) {
    expect(batch.get(id)).toEqual(await loadBillingSource(ctx.db, id));
  }
}

describe("loadBillingSources", () => {
  it("reads nothing for no contract", async () => {
    expect((await loadBillingSources(ctx.db, [])).size).toBe(0);
  });

  it("equals loadBillingSource after deliveries", async () => {
    await expectSameAsOneByOne([fx.from.id, fx.to.id]);
  });

  it("equals loadBillingSource across returns, transfers, closing, adjustments", async () => {
    const returned = await returnOf(
      ctx,
      { ...fx, deal: fx.from, siteLocation: "" },
      { "GG-K17": [28, 0, 0, 2] },
      { now: new Date("2026-11-05T02:40:00Z") },
    );
    expect(returned.ok).toBe(true);
    await movedNow(ctx, fx, { "GG-CH": 50 });
    const closed = await closeMonth(ctx, fx, "2026-11");
    expect(closed.ok).toBe(true);
    const adjusted = await createAdjustment(ctx.db, fx.accountant, {
      contractId: fx.from.id,
      month: "2026-12",
      refMonth: "2026-11",
      amount: -93_000,
      reason: "Kỳ 11 tính thừa 10 GG-CH",
    });
    expect(adjusted.ok).toBe(true);
    await expectSameAsOneByOne([fx.from.id, fx.to.id]);
  });

  it("follows a same-customer transfer whose source is outside the batch", async () => {
    await movedNow(ctx, fx, { "GG-CH": 50 });
    const batch = await loadBillingSources(ctx.db, [fx.to.id]);
    expect(batch.get(fx.to.id)).toEqual(
      await loadBillingSource(ctx.db, fx.to.id),
    );
  });
});
