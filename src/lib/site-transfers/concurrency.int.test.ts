// Site transfers running at the same time (site-operations spec
// site-transfers "Hai lệnh chuyển ngược chiều không kẹt", "Không ghi sổ sang
// hợp đồng chưa khóa"; design D4; task 3.5). Two connections, so the locks
// really meet.
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { inventoryLedger, siteTransfer } from "@/db/schema";
import { createSite } from "@/lib/catalog/places";
import { onSiteByItem } from "@/lib/deliveries/records";
import { createTestContext } from "@/test/auth";
import { d5Rental } from "@/test/contracts";
import { approvedContract } from "@/test/deliveries";
import { returnOf } from "@/test/returns";
import {
  draftTransfer,
  movedNow,
  setupSiteFixture,
  SITE_NOW,
  transferBody,
  type SiteFixture,
} from "@/test/site-operations";

import { postSiteTransfer } from "./post";
import { createSiteTransfer, updateSiteTransfer } from "./service";

const ctx = createTestContext();
const other = createDatabase(process.env.TEST_DATABASE_URL ?? "");
afterAll(async () => {
  await Promise.all([ctx.close(), other.close()]);
});

let fx: SiteFixture;
beforeEach(async () => {
  fx = await setupSiteFixture(ctx);
});

const K = 1000;
const onSite = async (contractId: string) =>
  ((await onSiteByItem(ctx.db, contractId)).get(fx.item("GG-K17")) ?? 0) / K;

describe("opposite transfers at once", () => {
  it("both post, one after the other, without a deadlock", async () => {
    await movedNow(ctx, fx, { "GG-K17": 40 });
    for (let round = 0; round < 10; round += 1) {
      const there = await draftTransfer(ctx, fx, { "GG-K17": 1 });
      const back = await createSiteTransfer(
        ctx.db,
        fx.sales,
        transferBody(
          fx,
          { "GG-K17": 1 },
          { fromContractId: fx.to.id, toContractId: fx.from.id },
        ),
        { now: SITE_NOW },
      );
      if (!back.ok) throw new Error(back.error);
      const [a, b] = await Promise.all([
        postSiteTransfer(
          ctx.db,
          fx.sales,
          there.id,
          { updatedAt: there.updatedAt },
          { now: SITE_NOW },
        ),
        postSiteTransfer(
          other.db,
          fx.sales,
          back.data.id,
          { updatedAt: back.data.updatedAt },
          { now: SITE_NOW },
        ),
      ]);
      expect([a.ok, b.ok]).toEqual([true, true]);
    }
    expect(await onSite(fx.from.id)).toBe(80);
    expect(await onSite(fx.to.id)).toBe(40);
  });
});

describe("a transfer and a return of the same goods", () => {
  it("lets only one of them take the goods", async () => {
    const draft = await draftTransfer(ctx, fx, { "GG-K17": 120 });
    const [moved, returned] = await Promise.all([
      postSiteTransfer(
        ctx.db,
        fx.sales,
        draft.id,
        { updatedAt: draft.updatedAt },
        { now: SITE_NOW },
      ),
      returnOf(
        { ...ctx, db: other.db },
        { ...fx, deal: fx.from, siteLocation: fx.fromLocation },
        { "GG-K17": [120, 0, 0, 0] },
        { now: SITE_NOW },
      ),
    ]);
    expect([moved.ok, returned.ok].filter(Boolean)).toHaveLength(1);
    expect(await onSite(fx.from.id)).toBe(0);
  });
});

describe("editing the receiving contract while posting", () => {
  async function hungRental() {
    const made = await createSite(ctx.db, fx.director, {
      name: "Nhà anh Hùng",
      address: "Hà Đông, Hà Nội",
      province: "HN",
      customerId: fx.customer("NT-0002"),
    });
    if (!made.ok) throw new Error(made.error);
    const deal = await approvedContract(ctx, fx, {
      ...d5Rental(fx),
      customerId: fx.customer("NT-0002"),
      siteId: made.data.id,
      customerToken: "HUNG",
    });
    return { ...deal, siteId: made.data.id };
  }

  it("never posts to a contract the posting did not lock", async () => {
    const hung = await hungRental();
    for (let round = 0; round < 5; round += 1) {
      const draft = await draftTransfer(ctx, fx, { "GG-K17": 1 });
      const [edit, post] = await Promise.all([
        updateSiteTransfer(
          ctx.db,
          fx.sales,
          draft.id,
          {
            ...transferBody(
              fx,
              { "GG-K17": 1 },
              { toContractId: hung.id, otherCustomerConfirmed: true },
            ),
            updatedAt: draft.updatedAt,
          },
          { now: new Date(SITE_NOW.getTime() + 60_000) },
        ),
        postSiteTransfer(
          other.db,
          fx.sales,
          draft.id,
          { updatedAt: draft.updatedAt },
          { now: SITE_NOW },
        ),
      ]);
      expect([edit.ok, post.ok].filter(Boolean)).toHaveLength(1);
      const [row] = await ctx.db
        .select()
        .from(siteTransfer)
        .where(eq(siteTransfer.id, draft.id));
      const lines = await ctx.db
        .select({ locationId: inventoryLedger.locationId })
        .from(inventoryLedger)
        .where(
          and(
            eq(inventoryLedger.documentId, draft.id),
            inArray(inventoryLedger.movement, ["TRANSFER_IN"]),
          ),
        );
      if (post.ok) {
        expect(row?.toContractId).toBe(fx.to.id);
        expect(lines.map((line) => line.locationId)).toEqual([fx.toLocation]);
      } else {
        expect(post).toMatchObject({ status: 409 });
        expect(row?.toContractId).toBe(hung.id);
        expect(lines).toEqual([]);
      }
    }
  });
});
