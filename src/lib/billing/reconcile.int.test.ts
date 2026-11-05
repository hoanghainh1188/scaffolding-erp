// npm run billing:check (receivables task 6.3): a closed period agrees with
// the ledger; a stored total that does not is reported.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { billingPeriod, contractRevision } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import { createTestContext } from "@/test/auth";
import { closeMonth } from "@/test/billing";
import { setupSiteFixture, type SiteFixture } from "@/test/site-operations";

import { reconcileBilling } from "./reconcile";

const ctx = createTestContext();
afterAll(ctx.close);

const DEC_2 = "2026-12-02" as BusinessDate;

let fx: SiteFixture;
beforeEach(async () => {
  fx = await setupSiteFixture(ctx);
});

describe("reconcileBilling", () => {
  it("finds no difference after a real closing", async () => {
    const closed = await closeMonth(ctx, fx, "2026-11");
    expect(closed.ok).toBe(true);
    expect(await reconcileBilling(ctx.db, DEC_2)).toEqual([]);
  });

  it("reports a period whose stored total differs", async () => {
    const [rev] = await ctx.db
      .select({ id: contractRevision.id })
      .from(contractRevision)
      .where(eq(contractRevision.contractId, fx.from.id));
    await ctx.db.insert(billingPeriod).values({
      contractId: fx.from.id,
      month: "2026-10-01",
      periodEnd: "2026-10-31",
      revisionId: rev?.id ?? "",
      rentAmount: 999,
      adjustmentAmount: 0,
      freightAmount: 0,
      vatAmount: 0,
      totalAmount: 999,
      paymentTermsDays: 30,
      dueDate: "2026-11-30",
      holidayDays: 0,
      lineCount: 1,
      closedBy: fx.accountant.id,
      closedAt: new Date(),
    });
    expect(await reconcileBilling(ctx.db, DEC_2)).toEqual([
      `${fx.from.code} · kỳ 10/2026: đã chốt 999 ₫, tính lại 0 ₫`,
    ]);
  });
});
