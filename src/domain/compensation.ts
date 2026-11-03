// Compensation notes (returns-and-compensation design D3, D5, D10; 0.2 #20,
// #64): the lines made from a return note and the contract prices on the
// return date, totals, discount, the amount due and its due date, and the
// status table. Pure: the service reads rows and calls these.
import { lineAmount } from "./average-cost";
import { addDays, type BusinessDate } from "./business-date";
import { DomainValueError } from "./errors";
import { formatMoney, toMoney, type Money } from "./money";
import {
  formatQuantity,
  QUANTITY_UNIT_LABELS,
  sumByUnit,
  toQuantity,
  type QuantityUnit,
  type UnitAmount,
} from "./quantity";
import type { ReturnCounts } from "./return-note";

export const COMPENSATION_PREFIX = "ĐB";
export const COMPENSATION_REASON_MAX = 500;

export const COMPENSATION_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;
export type CompensationStatus = (typeof COMPENSATION_STATUSES)[number];

export const COMPENSATION_STATUS_LABELS: Readonly<
  Record<CompensationStatus, string>
> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối",
};

export const COMPENSATION_KINDS = ["DAMAGED", "SCRAPPED", "LOST"] as const;
export type CompensationKind = (typeof COMPENSATION_KINDS)[number];

/** Condition shown on D8 ("Chờ sửa", "Phế liệu", "Mất"). */
export const COMPENSATION_KIND_LABELS: Readonly<
  Record<CompensationKind, string>
> = {
  DAMAGED: "Chờ sửa",
  SCRAPPED: "Phế liệu",
  LOST: "Mất",
};

/** The price note under each kind (0.2 #20). */
export const COMPENSATION_PRICE_NOTES: Readonly<
  Record<CompensationKind, string>
> = {
  DAMAGED: "giá hỏng, sửa được",
  SCRAPPED: "tính như mất",
  LOST: "giá mất",
};

const money = (value: number) => formatMoney(toMoney(value));

export const COMPENSATION_MESSAGES = {
  noPrice: (code: string, kind: CompensationKind) =>
    `${code} ${COMPENSATION_KIND_LABELS[kind]} chưa có giá đền trong hợp đồng. Nhập đơn giá trước khi duyệt.`,
  badPrice: "Đơn giá đền phải là số tiền không âm.",
  priceKnown: (code: string, kind: CompensationKind) =>
    `${code} ${COMPENSATION_KIND_LABELS[kind]} đã có giá trong hợp đồng. Muốn bớt thì dùng giảm trừ.`,
  discountReason: "Bạn cần ghi lý do giảm trừ.",
  discountNegative: "Số tiền giảm không được âm.",
  discountTooLarge: (discount: number, total: number) =>
    `Số tiền giảm (${money(discount)}) lớn hơn tiền đền bù (${money(total)}).`,
  rejectReason: "Bạn cần ghi lý do từ chối.",
  overdueReason: (amount: number, days: number) =>
    `Nhà thầu đang nợ quá hạn ${money(amount)} (${days} ngày). Bạn cần ghi lý do duyệt.`,
  reasonLong: `Lý do tối đa ${COMPENSATION_REASON_MAX} ký tự.`,
  approved: "Phiếu đền bù đã duyệt, không sửa được nữa.",
  rejected: "Phiếu đền bù đã từ chối, không sửa được nữa.",
  stale: "Phiếu vừa được sửa ở nơi khác. Tải lại để xem bản mới.",
  notFound: "Không tìm thấy phiếu đền bù.",
} as const;

const fail = (message: string): never => {
  throw new DomainValueError(message);
};

/** A price row of the contract revision on the return date. */
export interface CompensationPrice {
  readonly itemId: string;
  readonly lostPrice: number | null;
  readonly damagePrice: number | null;
}

export interface CompensationSourceLine {
  readonly itemId: string;
  readonly counts: ReturnCounts;
}

export interface CompensationLineDraft {
  readonly itemId: string;
  readonly kind: CompensationKind;
  readonly quantityMilli: number;
  /** Null when the contract has no price for it. */
  readonly unitPrice: Money | null;
  readonly contractPrice: Money | null;
}

const KIND_MILLI: Readonly<
  Record<CompensationKind, (counts: ReturnCounts) => number>
> = {
  DAMAGED: (counts) => counts.repairMilli,
  SCRAPPED: (counts) => counts.scrapMilli,
  LOST: (counts) => counts.lostMilli,
};

/** 0.2 #20: Chờ sửa = giá hỏng; Phế liệu = giá mất; Mất = giá mất. */
export function priceFor(
  kind: CompensationKind,
  price: CompensationPrice | undefined,
): Money | null {
  const value = kind === "DAMAGED" ? price?.damagePrice : price?.lostPrice;
  return value === null || value === undefined ? null : toMoney(value);
}

/** One line per (item, kind) with a quantity; none at all → no note. */
export function compensationLines(
  lines: readonly CompensationSourceLine[],
  prices: readonly CompensationPrice[],
): CompensationLineDraft[] {
  const byItem = new Map(prices.map((row) => [row.itemId, row]));
  const drafts: CompensationLineDraft[] = [];
  for (const line of lines) {
    for (const kind of COMPENSATION_KINDS) {
      const quantityMilli = KIND_MILLI[kind](line.counts);
      if (quantityMilli <= 0) continue;
      const price = priceFor(kind, byItem.get(line.itemId));
      drafts.push({
        itemId: line.itemId,
        kind,
        quantityMilli,
        unitPrice: price,
        contractPrice: price,
      });
    }
  }
  return drafts;
}

export interface PricedLine {
  readonly itemCode: string;
  readonly kind: CompensationKind;
  readonly quantityMilli: number;
  readonly unitPrice: number | null;
}

/** Thành tiền of a line, 1 ₫ halves up; null while it has no price. */
export function compensationLineAmount(line: PricedLine): Money | null {
  return line.unitPrice === null
    ? null
    : lineAmount(line.quantityMilli, toMoney(line.unitPrice));
}

/** Sum of the priced lines; unpriced lines count 0 (D8 shows "Chưa có giá"). */
export function compensationTotal(lines: readonly PricedLine[]): Money {
  return toMoney(
    lines.reduce((sum, line) => sum + (compensationLineAmount(line) ?? 0), 0),
  );
}

/** Approving needs a price on every line. */
export function assertPriced(lines: readonly PricedLine[]): void {
  const missing = lines.find((line) => line.unitPrice === null);
  if (missing)
    fail(COMPENSATION_MESSAGES.noPrice(missing.itemCode, missing.kind));
}

const clean = (reason: string | null | undefined) => {
  const text = reason?.trim() ?? "";
  return text === "" ? null : text;
};

/** A reason trimmed to null, refused when too long. */
export function reasonOrNull(reason: string | null | undefined): string | null {
  const text = clean(reason);
  if (text !== null && text.length > COMPENSATION_REASON_MAX) {
    fail(COMPENSATION_MESSAGES.reasonLong);
  }
  return text;
}

/** 0 ≤ discount ≤ total; a discount needs a reason (0.2 #20). */
export function assertDiscount(
  total: number,
  discount: number,
  reason: string | null | undefined,
): string | null {
  if (!Number.isInteger(discount) || discount < 0) {
    fail(COMPENSATION_MESSAGES.discountNegative);
  }
  if (discount > total) {
    fail(COMPENSATION_MESSAGES.discountTooLarge(discount, total));
  }
  const text = reasonOrNull(reason);
  if (discount > 0 && text === null) fail(COMPENSATION_MESSAGES.discountReason);
  return discount > 0 ? text : null;
}

export const amountDue = (total: number, discount: number): Money =>
  toMoney(total - discount);

/** Hạn trả = ngày duyệt + số ngày được nợ (0.2 #18). */
export const dueDate = (
  approvedDate: BusinessDate,
  paymentTermsDays: number,
): BusinessDate => addDays(approvedDate, paymentTermsDays);

export type CompensationCommand = "EDIT" | "APPROVE" | "REJECT";

/** Only a pending note changes; approval and rejection are final (D3). */
export function transition(
  status: CompensationStatus,
  command: CompensationCommand,
): CompensationStatus {
  if (status === "APPROVED") return fail(COMPENSATION_MESSAGES.approved);
  if (status === "REJECTED") return fail(COMPENSATION_MESSAGES.rejected);
  if (command === "APPROVE") return "APPROVED";
  if (command === "REJECT") return "REJECTED";
  return "PENDING";
}

export interface KindSummary {
  readonly kind: CompensationKind;
  readonly quantities: UnitAmount[];
  readonly amount: Money;
}

/** The D8 summary tile: quantity by unit and money for each kind. */
export function summaryByKind(
  lines: readonly (PricedLine & { unit: QuantityUnit })[],
): KindSummary[] {
  return COMPENSATION_KINDS.flatMap((kind) => {
    const rows = lines.filter((line) => line.kind === kind);
    if (rows.length === 0) return [];
    return [
      {
        kind,
        quantities: sumByUnit(
          rows.map((row) => ({ unit: row.unit, milli: row.quantityMilli })),
        ),
        amount: compensationTotal(rows),
      },
    ];
  });
}

/** "15 cái" of a line. */
export const lineQuantityText = (milli: number, unit: QuantityUnit): string =>
  `${formatQuantity(toQuantity(milli, unit))} ${QUANTITY_UNIT_LABELS[unit]}`;
