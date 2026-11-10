// Payables (payables spec, design D1–D3): what the company owes a seller.
// Each posted goods receipt is a debt worth its goods value (receiptPayable)
// due on its stored due date; supplier payments settle debts in a fixed
// order, the rest is an advance that settles later receipts (0.2 #99–số 104).
// Pure functions on top of the core shared with receivables (./allocation).
import {
  allocateOrdered,
  applyCreditsOrdered,
  dueStatus,
  holderStatus,
  type CreditAllocation,
  type CreditSource,
  type DueStatus,
  type HolderStatus,
  type ManualPart,
  type OrderedAllocation,
} from "./allocation";
import {
  addDays,
  formatBusinessDate,
  type BusinessDate,
} from "./business-date";
import { formatMoney, toMoney, type Money } from "./money";
import {
  formatQuantity,
  isPieceUnit,
  QUANTITY_UNIT_LABELS,
  toQuantity,
  type QuantityUnit,
} from "./quantity";

export const PAYMENT_KINDS = ["PAYMENT", "ADVANCE"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];
export const PAYMENT_KIND_LABELS: Readonly<Record<PaymentKind, string>> = {
  PAYMENT: "Trả tiền hàng",
  ADVANCE: "Ứng trước",
};

/** Code prefix of a supplier payment: PC-YYYY-NNN. */
export const PAYMENT_PREFIX = "PC";

/** Longest note or cancel reason. */
export const PAYMENT_TEXT_MAX = 500;

/** Allowed days a seller lets us owe (D16, 0.2 #99). */
export const PAYMENT_TERMS_MAX_DAYS = 365;

/** A posted goods receipt with what is left of it. */
export interface OpenPayable {
  /** goods_receipt.id */
  key: string;
  /** PN-YYYY-NNN, also the label in messages. */
  code: string;
  label: string;
  /** Receipt day (business date). */
  issuedDate: BusinessDate;
  dueDate: BusinessDate;
  remaining: Money;
}

/** A rule of payables broken by the request (422) or by a race (409). */
export class PayableRuleError extends Error {
  override readonly name = "PayableRuleError";
  readonly status: 409 | 422;

  constructor(message: string, status: 409 | 422 = 422) {
    super(message);
    this.status = status;
  }
}

export const PAYABLE_MESSAGES = {
  amount: "Số tiền phải lớn hơn 0 ₫.",
  unknownDebt: "Khoản được chọn không thuộc người bán này.",
  manualTooMuch: (amount: Money) =>
    `Tổng các khoản chỉ định vượt số tiền phiếu chi (${formatMoney(amount)}).`,
  overDebt: (label: string, remaining: Money) =>
    remaining <= 0
      ? `${label} đã được trả đủ bởi phiếu khác. Bạn xem lại rồi ghi.`
      : `${label} chỉ còn ${formatMoney(remaining)}.`,
  advanceWhileOwing: (supplier: string, owed: Money) =>
    `${supplier} còn phải trả ${formatMoney(owed)}. Bạn chọn Trả tiền hàng: phần dư tự thành tiền ứng trước.`,
  paidDateFuture: (today: BusinessDate) =>
    `Ngày chi không được sau hôm nay (${formatBusinessDate(today)}).`,
  reasonRequired: "Bạn ghi lý do hủy phiếu chi.",
  textTooLong: `Ghi chú tối đa ${PAYMENT_TEXT_MAX} ký tự.`,
  alreadyCancelled: (code: string, at: string, by: string) =>
    `Phiếu ${code} đã hủy lúc ${at} bởi ${by}.`,
  termsRange: `Số ngày được nợ từ 0 đến ${PAYMENT_TERMS_MAX_DAYS} ngày`,
  sellerAnonymized: "Người bán đã ẩn danh, không ghi chứng từ mới được.",
} as const;

type Ordered = Pick<OpenPayable, "dueDate" | "issuedDate" | "code">;

/** The fixed order (spec payables): due date, receipt day, receipt code. */
export function comparePayables(a: Ordered, b: Ordered): number {
  return (
    a.dueDate.localeCompare(b.dueDate) ||
    a.issuedDate.localeCompare(b.issuedDate) ||
    a.code.localeCompare(b.code)
  );
}

export function orderPayables<T extends Ordered>(debts: readonly T[]): T[] {
  return [...debts].sort(comparePayables);
}

/** Due date of a receipt: receipt day + the seller's days (0.2 #99). */
export function payableDueDate(
  receiptDay: BusinessDate,
  paymentTermsDays: number,
): BusinessDate {
  return addDays(receiptDay, paymentTermsDays);
}

export interface PaymentPlan {
  allocations: OrderedAllocation[];
  /** What becomes the seller's advance (0.2 số 100). */
  advance: Money;
}

/**
 * Splits a supplier payment. "Trả tiền hàng": the named parts, then the
 * open receipts in the fixed order; the rest is an advance. "Ứng trước":
 * only when the seller owes nothing (0.2 số 102); all of it is an advance.
 */
export function allocatePayment(input: {
  kind: PaymentKind;
  amount: Money;
  supplierName: string;
  openPayables: readonly OpenPayable[];
  manual?: readonly ManualPart[];
  seen?: ReadonlyMap<string, Money>;
}): PaymentPlan {
  if (input.amount <= 0) throw new PayableRuleError(PAYABLE_MESSAGES.amount);
  if (input.kind === "ADVANCE") {
    const owed = input.openPayables.reduce(
      (sum, debt) => sum + Math.max(debt.remaining, 0),
      0,
    );
    if (owed > 0) {
      throw new PayableRuleError(
        PAYABLE_MESSAGES.advanceWhileOwing(input.supplierName, toMoney(owed)),
      );
    }
    return { allocations: [], advance: input.amount };
  }
  const result = allocateOrdered({
    amount: input.amount,
    debts: orderPayables(input.openPayables),
    manual: input.manual,
    seen: input.seen,
    messages: PAYABLE_MESSAGES,
    fail: (message, status) => new PayableRuleError(message, status),
  });
  return { allocations: result.allocations, advance: result.unapplied };
}

/** Settles open receipts in the fixed order from older advances first. */
export function applyAdvances(input: {
  advances: readonly CreditSource[];
  openPayables: readonly OpenPayable[];
}): CreditAllocation[] {
  return applyCreditsOrdered({
    credits: input.advances,
    debts: orderPayables(input.openPayables),
  });
}

/** Status of one receipt on `today` (Vietnamese day). */
export function payableStatus(
  remaining: number,
  dueDate: BusinessDate,
  today: BusinessDate,
): DueStatus {
  return dueStatus(remaining, dueDate, today, "Đã trả đủ");
}

/** The "Tình hình" of a seller row on D14c: the D14 rule (0.2 số 104). */
export function supplierStatus(input: {
  payables: readonly Pick<OpenPayable, "remaining" | "dueDate">[];
  advance: Money;
  today: BusinessDate;
}): HolderStatus {
  return holderStatus({
    debts: input.payables,
    credit: input.advance,
    today: input.today,
    creditLabel: "Đã ứng trước",
  });
}

/** "trả ngay" / "nợ 30 ngày" (seller row on D14c). */
export function termsLabel(days: number): string {
  return days === 0 ? "trả ngay" : `nợ ${days} ngày`;
}

/** "Trả ngay khi nhập" / "Nợ 30 ngày" (seller block, D16). */
export function termsHeading(days: number): string {
  return days === 0 ? "Trả ngay khi nhập" : `Nợ ${days} ngày`;
}

export interface GoodsLine {
  /** Received, in the unit below, in thousandths. */
  quantityMilli: number;
  unit: QuantityUnit;
  name: string;
  /** A kg line paid by the kg weighed. */
  weighed: boolean;
}

/** Shown lines of the "Hàng" column before "và N mã khác". */
const SHOWN_GOODS = 2;

function goodsText(line: GoodsLine): string {
  const quantity = formatQuantity(toQuantity(line.quantityMilli, line.unit));
  const unit = isPieceUnit(line.unit)
    ? ""
    : ` ${QUANTITY_UNIT_LABELS[line.unit]}`;
  return `${quantity}${unit} ${line.name}${line.weighed ? " cân thực tế" : ""}`;
}

/** "650 chéo 1,7m cũ, 120 khung 1,7m cũ và 2 mã khác" (D14c). */
export function goodsSummary(lines: readonly GoodsLine[]): string {
  const counted = lines.filter((line) => line.quantityMilli > 0);
  const shown = counted.slice(0, SHOWN_GOODS).map(goodsText).join(", ");
  const more = counted.length - SHOWN_GOODS;
  return more > 0 ? `${shown} và ${more} mã khác` : shown;
}
