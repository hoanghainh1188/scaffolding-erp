// Integration-test helper for contract settlement (receivables tasks 5.x):
// the fixture's rental gets every piece back on 05/11/2026 and November is
// closed on 02/12/2026, so on 04/12/2026 the contract may be settled.
import type { BusinessDate } from "@/domain/business-date";
import { closeBillingPeriod } from "@/lib/billing/close";

import type { TestContext } from "./auth";
import { DEC_2, shownTotal } from "./billing";
import type { ReceivableFixture } from "./receivables";
import { returnOf } from "./returns";

export const DEC_4 = new Date("2026-12-04T03:00:00Z");
export const DEC_4_DATE = "2026-12-04" as BusinessDate;

/** Everything returned, November closed; returns the November total. */
export async function settleReadyContract(
  ctx: TestContext,
  fx: ReceivableFixture,
): Promise<{ now: Date; today: BusinessDate; novemberTotal: number }> {
  const back = await returnOf(ctx, fx, {
    "GG-K17": [120, 0, 0, 0],
    "GG-CH": [260, 0, 0, 0],
    "GG-M16": [60, 0, 0, 0],
  });
  if (!back.ok) throw new Error(back.error);
  const total = await shownTotal(
    ctx,
    fx.deal.id,
    "2026-11",
    "2026-12-02" as BusinessDate,
  );
  const closed = await closeBillingPeriod(
    ctx.db,
    fx.accountant,
    fx.deal.id,
    "2026-11",
    { expectedTotal: total },
    { now: DEC_2 },
  );
  if (!closed.ok) throw new Error(closed.error);
  return { now: DEC_4, today: DEC_4_DATE, novemberTotal: total };
}
