// Rent of a contract by month from the ledger (rental-billing design D1,
// D6): one source per contract (pieces, terms, items, freight,
// adjustments, closed months), then the pure statement of any month, the
// months that have something to bill and why a month cannot be closed yet.
import { asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { billingAdjustment, billingPeriod, user } from "@/db/schema";
import {
  addDays,
  formatBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";
import {
  buildStatement,
  formatMonth,
  hasContent,
  monthOf,
  nextMonth,
  periodOf,
  type BillingTerms,
  type FreightInput,
  type ItemFacts,
  type Statement,
  type StatementAdjustment,
} from "@/domain/rental-billing";
import type { HolidayRange } from "@/domain/rental-holiday";
import type { Piece } from "@/domain/rental-lots";

import {
  billingTerms,
  contractFreight,
  contractPieces,
  itemFactsOf,
} from "./ledger";

type Reader = Pick<Database, "select">;

export interface ClosedMonth {
  id: string;
  month: string;
  closedAt: Date;
  closedByName: string;
}

export interface AdjustmentRow extends StatementAdjustment {
  month: string;
}

export interface BillingSource {
  contractId: string;
  pieces: Piece[];
  terms: BillingTerms[];
  items: Map<string, ItemFacts>;
  freight: FreightInput[];
  adjustments: AdjustmentRow[];
  closed: Map<string, ClosedMonth>;
  /** First month with a ledger line, freight or adjustment; null if none. */
  firstMonth: string | null;
}

export const CLOSE_MESSAGES = {
  notOver: (month: string, firstDay: string) =>
    `Kỳ ${formatMonth(month)} chưa hết. Bạn chốt từ ngày ${formatBusinessDate(firstDay)}.`,
  closed: (month: string, at: string, by: string) =>
    `Kỳ ${formatMonth(month)} đã được chốt lúc ${at} bởi ${by}.`,
  earlierOpen: (earlier: string, month: string) =>
    `Kỳ ${formatMonth(earlier)} của hợp đồng này chưa chốt. Bạn chốt kỳ ${formatMonth(earlier)} trước rồi chốt kỳ ${formatMonth(month)}.`,
  empty: (month: string) =>
    `Kỳ ${formatMonth(month)} của hợp đồng này không có tiền thuê, cước hay điều chỉnh nên không cần chốt.`,
  missingPrice: (codes: readonly string[]) =>
    `Hợp đồng chưa có giá thuê cho ${codes.join(", ")}. Bạn lập phụ lục bổ sung giá rồi chốt.`,
  changed: (seen: string, now: string) =>
    `Số phải thu đã đổi từ ${seen} thành ${now} từ lúc bạn mở. Bạn xem lại rồi chốt.`,
  noTerms: "Hợp đồng chưa được duyệt nên chưa tính được tiền thuê.",
} as const;

async function readAdjustments(
  tx: Reader,
  contractId: string,
): Promise<AdjustmentRow[]> {
  const rows = await tx
    .select({
      id: billingAdjustment.id,
      month: billingAdjustment.month,
      refMonth: billingAdjustment.refMonth,
      amount: billingAdjustment.amount,
      reason: billingAdjustment.reason,
      createdByName: user.name,
      createdAt: billingAdjustment.createdAt,
      updatedAt: billingAdjustment.updatedAt,
    })
    .from(billingAdjustment)
    .innerJoin(user, eq(user.id, billingAdjustment.createdBy))
    .where(eq(billingAdjustment.contractId, contractId))
    .orderBy(asc(billingAdjustment.createdAt));
  return rows.map((row) => ({
    ...row,
    month: monthOf(row.month),
    refMonth: monthOf(row.refMonth),
  }));
}

/** Closed months of a contract (billing_period). */
export async function closedMonths(
  tx: Reader,
  contractId: string,
): Promise<Map<string, ClosedMonth>> {
  const rows = await tx
    .select({
      id: billingPeriod.id,
      month: billingPeriod.month,
      closedAt: billingPeriod.closedAt,
      closedByName: user.name,
    })
    .from(billingPeriod)
    .innerJoin(user, eq(user.id, billingPeriod.closedBy))
    .where(eq(billingPeriod.contractId, contractId));
  return new Map(
    rows.map((row) => [
      monthOf(row.month),
      { ...row, month: monthOf(row.month) },
    ]),
  );
}

/** Everything the rent of a contract is computed from. */
export async function loadBillingSource(
  tx: Reader,
  contractId: string,
): Promise<BillingSource> {
  const [{ pieces, lines }, terms, freight, adjustments, closed] =
    await Promise.all([
      contractPieces(tx, contractId),
      billingTerms(tx, contractId),
      contractFreight(tx, contractId),
      readAdjustments(tx, contractId),
      closedMonths(tx, contractId),
    ]);
  const items = await itemFactsOf(
    tx,
    pieces.map((piece) => piece.itemId),
  );
  const starts = [
    ...lines.map((line) => line.businessDate as string),
    ...freight.map((entry) => entry.date as string),
    ...adjustments.map((entry) => `${entry.month}-01`),
  ].sort();
  return {
    contractId,
    pieces,
    terms,
    items,
    freight,
    adjustments,
    closed,
    firstMonth: starts[0] ? monthOf(starts[0]) : null,
  };
}

/** The open (computed) statement of one month. */
export function statementOf(
  source: BillingSource,
  month: string,
  today: BusinessDate,
  holidays: readonly HolidayRange[],
): Statement {
  if (source.terms.length === 0) throw new Error(CLOSE_MESSAGES.noTerms);
  return buildStatement({
    period: periodOf(month),
    today,
    pieces: source.pieces,
    terms: source.terms,
    holidays,
    items: source.items,
    freight: source.freight,
    adjustments: source.adjustments.filter((entry) => entry.month === month),
  });
}

/** Months before `month` with something to bill and not closed yet. */
export function openEarlierMonths(
  source: BillingSource,
  month: string,
  today: BusinessDate,
  holidays: readonly HolidayRange[],
): string[] {
  const open: string[] = [];
  if (!source.firstMonth) return open;
  for (let at = source.firstMonth; at < month; at = nextMonth(at)) {
    if (source.closed.has(at)) continue;
    if (hasContent(statementOf(source, at, today, holidays))) open.push(at);
  }
  return open;
}

const clock = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Why `month` cannot be closed today, or null when it can (design D6). */
export function closeBlock(
  source: BillingSource,
  statement: Statement,
  today: BusinessDate,
  holidays: readonly HolidayRange[],
): string | null {
  const { month } = statement.period;
  const done = source.closed.get(month);
  if (done) {
    return CLOSE_MESSAGES.closed(
      month,
      clock.format(done.closedAt),
      done.closedByName,
    );
  }
  if (today <= statement.period.to) {
    return CLOSE_MESSAGES.notOver(month, addDays(statement.period.to, 1));
  }
  const earlier = openEarlierMonths(source, month, today, holidays)[0];
  if (earlier) return CLOSE_MESSAGES.earlierOpen(earlier, month);
  if (!hasContent(statement)) return CLOSE_MESSAGES.empty(month);
  if (statement.missingPrices.length > 0) {
    return CLOSE_MESSAGES.missingPrice(statement.missingPrices);
  }
  return null;
}
