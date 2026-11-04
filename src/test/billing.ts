// Integration-test helpers for rental-billing (tasks 4.x, 5.x): the site
// fixture (An Phú – Block B received 120 GG-K17, 260 GG-CH and 60 GG-M16 on
// 03/11/2026, rent 7.452.000 ₫ for November), dates, and a closing helper.
import type { BusinessDate } from "@/domain/business-date";
import { closeBillingPeriod } from "@/lib/billing/close";
import { contractStatement } from "@/lib/billing/queries";

import type { TestContext } from "./auth";
import type { SiteFixture } from "./site-operations";

/** 02/12/2026 09:12 in Vietnam: November is over. */
export const DEC_2 = new Date("2026-12-02T02:12:00Z");
export const DEC_2_DATE = "2026-12-02" as BusinessDate;
/** 120 × 27 × 1.200 + 260 × 27 × 300 + 60 × 27 × 900. */
export const NOVEMBER_TOTAL = 3_888_000 + 2_106_000 + 1_458_000;

/** The amount D7 shows today for a month. */
export async function shownTotal(
  ctx: TestContext,
  contractId: string,
  month: string,
  today: BusinessDate = DEC_2_DATE,
): Promise<number> {
  const view = await contractStatement(ctx.db, contractId, month, today);
  if (!view) throw new Error("no statement");
  return view.statement.totalAmount;
}

/** thuha closes a month at `now`, with the amount D7 shows. */
export async function closeMonth(
  ctx: TestContext,
  fx: SiteFixture,
  month: string,
  now: Date = DEC_2,
  contractId: string = fx.from.id,
) {
  const today = now.toISOString().slice(0, 10) as BusinessDate;
  return closeBillingPeriod(
    ctx.db,
    fx.accountant,
    contractId,
    month,
    { expectedTotal: await shownTotal(ctx, contractId, month, today) },
    { now },
  );
}
