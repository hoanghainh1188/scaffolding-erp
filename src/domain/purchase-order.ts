// Purchase orders (purchase-orders spec, design D2, D4, D6): line and cost
// rules, expected totals, status labels and the one table of allowed status
// changes. goods-receipt calls transition() with the RECEIVE_* commands.
import { dict } from "@/locales";

import { lineAmount } from "./average-cost";
import { DomainValueError } from "./errors";
import { toMoney, type Money } from "./money";
import { quantityFromDb, type QuantityUnit } from "./quantity";

export const PURCHASE_KINDS = ["NEW", "USED"] as const;
export type PurchaseKind = (typeof PURCHASE_KINDS)[number];

export const PURCHASE_KIND_LABELS: Readonly<Record<PurchaseKind, string>> = {
  NEW: dict.purchasing.kind.NEW,
  USED: dict.purchasing.kind.USED,
};

/** Stored statuses: the domain-values set without PENDING_APPROVAL. */
export const PURCHASE_STATUSES = ["DRAFT", "IN_PROGRESS", "DONE"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const PURCHASE_OUTCOMES = ["RECEIVED", "CLOSED", "CANCELLED"] as const;
export type PurchaseOutcome = (typeof PURCHASE_OUTCOMES)[number];

export const PURCHASE_OUTCOME_LABELS: Readonly<
  Record<PurchaseOutcome, string>
> = {
  RECEIVED: "Đã nhận đủ",
  CLOSED: "Đã đóng",
  CANCELLED: "Đã hủy",
};

export const PURCHASE_PREFIX = "PO";
export const COST_LABEL_MAX = 60;
export const END_REASON_MAX = 500;
export const COST_LABEL_SUGGESTIONS = [
  "Cước xe tải",
  "Bốc xếp",
  "Cầu đường",
] as const;

export const PURCHASE_MESSAGES = {
  notFound: dict.purchasing.messages.notFound,
  supplier: dict.purchasing.messages.supplierRequired,
  supplierArchived: dict.purchasing.messages.supplierArchived,
  itemMissing: dict.purchasing.messages.itemRequired,
  itemArchived: dict.purchasing.messages.itemArchived,
  duplicate: dict.purchasing.messages.duplicateItem,
  kgOnly: dict.purchasing.messages.kgOnly,
  wholePieces: dict.purchasing.messages.wholePieces,
  quantity: dict.purchasing.messages.quantityPositive,
  price: dict.purchasing.messages.pricePositive,
  costLabel: dict.purchasing.messages.costLabelRequired,
  costLabelLong: dict.purchasing.messages.costLabelTooLong(COST_LABEL_MAX),
  costAmount: dict.purchasing.messages.costAmountPositive,
  noLines: dict.purchasing.messages.noLines,
  noDate: dict.purchasing.messages.noDate,
  placed: dict.purchasing.messages.alreadyPlaced,
  notPlaced: dict.purchasing.messages.notPlaced,
  done: dict.purchasing.messages.alreadyDone,
  cancelReceived: dict.purchasing.messages.cancelWithReceipts,
  cancelReason: dict.purchasing.messages.cancelReasonRequired,
  reasonTooLong: dict.purchasing.messages.reasonTooLong(END_REASON_MAX),
  closeNoReceipts: dict.purchasing.messages.closeNoReceipts,
  deletePlaced: dict.purchasing.messages.deletePlaced,
  editLocked: dict.purchasing.messages.supplierLocked,
  stale: dict.common.alerts.staleData,
} as const;

/** A domain error that belongs to one form field ("lines.0.quantity"). */
export class PurchaseFieldError extends DomainValueError {
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.field = field;
  }
}

export interface OrderLineCheck {
  itemCode: string;
  /** Unit the item is counted in. */
  itemUnit: QuantityUnit;
  /** Unit the line is ordered in. */
  unit: QuantityUnit;
  quantityMilli: number;
  unitPrice: number;
}

/** Line rules (spec "Đơn vị đặt hàng", "Nội dung đơn thu mua"). */
export function checkOrderLines(lines: readonly OrderLineCheck[]): void {
  const seen = new Set<string>();
  lines.forEach((line, index) => {
    const field = `lines.${index}`;
    if (seen.has(line.itemCode)) {
      throw new PurchaseFieldError(
        PURCHASE_MESSAGES.duplicate(line.itemCode),
        `${field}.itemId`,
      );
    }
    seen.add(line.itemCode);
    if (line.itemUnit === "KG" && line.unit !== "KG") {
      throw new PurchaseFieldError(
        PURCHASE_MESSAGES.kgOnly(line.itemCode),
        `${field}.unit`,
      );
    }
    if (!Number.isInteger(line.quantityMilli) || line.quantityMilli <= 0) {
      throw new PurchaseFieldError(
        PURCHASE_MESSAGES.quantity,
        `${field}.quantity`,
      );
    }
    if (line.unit === "PIECE" && line.quantityMilli % 1000 !== 0) {
      throw new PurchaseFieldError(
        PURCHASE_MESSAGES.wholePieces(line.itemCode),
        `${field}.quantity`,
      );
    }
    if (!Number.isSafeInteger(line.unitPrice) || line.unitPrice < 0) {
      throw new PurchaseFieldError(
        PURCHASE_MESSAGES.price,
        `${field}.unitPrice`,
      );
    }
  });
}

export interface OrderCostInput {
  label: string;
  amount: number;
}

/** Trimmed cost lines, or the first broken one as a field error. */
export function checkOrderCosts(
  costs: readonly OrderCostInput[],
): { label: string; amount: Money }[] {
  return costs.map((cost, index) => {
    const label = cost.label.trim();
    if (label === "") {
      throw new PurchaseFieldError(
        PURCHASE_MESSAGES.costLabel,
        `costs.${index}.label`,
      );
    }
    if (label.length > COST_LABEL_MAX) {
      throw new PurchaseFieldError(
        PURCHASE_MESSAGES.costLabelLong,
        `costs.${index}.label`,
      );
    }
    if (!Number.isSafeInteger(cost.amount) || cost.amount <= 0) {
      throw new PurchaseFieldError(
        PURCHASE_MESSAGES.costAmount,
        `costs.${index}.amount`,
      );
    }
    return { label, amount: toMoney(cost.amount) };
  });
}

/** Quantity × unit price, to 1 ₫ with halves up (0.2 #10). */
export function orderLineAmount(
  quantityMilli: number,
  unitPrice: Money,
): Money {
  return lineAmount(quantityMilli, unitPrice);
}

export interface OrderTotals {
  goods: Money;
  costs: Money;
  total: Money;
}

export function orderTotals(
  lines: readonly { quantityMilli: number; unitPrice: Money }[],
  costs: readonly { amount: Money }[],
): OrderTotals {
  const goods = lines.reduce(
    (sum, line) => sum + orderLineAmount(line.quantityMilli, line.unitPrice),
    0,
  );
  const extra = costs.reduce((sum, cost) => sum + cost.amount, 0);
  return {
    goods: toMoney(goods),
    costs: toMoney(extra),
    total: toMoney(goods + extra),
  };
}

/**
 * Pieces in a kg line of a piece item: kg ÷ standard weight, rounded down
 * (spec: "≈ 148 cái"). Display only; null when there is no weight.
 */
export function estimatedPieces(
  kgMilli: number,
  standardWeightKg: string | null,
): number | null {
  if (!standardWeightKg) return null;
  const weight = quantityFromDb(standardWeightKg, "KG").milli;
  if (weight <= 0) return null;
  return Math.floor(kgMilli / weight);
}

export interface StatusLabel {
  main: string;
  detail: string | null;
}

/** "Đang xử lý · Chờ xe về" and friends (spec "Trạng thái đơn thu mua"). */
export function purchaseStatusLabel(
  status: PurchaseStatus,
  outcome: PurchaseOutcome | null,
  hasReceipts: boolean,
): StatusLabel {
  if (status === "DRAFT") return { main: "Nháp", detail: null };
  if (status === "IN_PROGRESS") {
    return {
      main: "Đang xử lý",
      detail: hasReceipts ? "Đang nhận" : "Chờ xe về",
    };
  }
  return {
    main: "Hoàn thành",
    detail: outcome ? PURCHASE_OUTCOME_LABELS[outcome] : null,
  };
}

export const PURCHASE_COMMANDS = [
  "PLACE",
  "CANCEL",
  "CLOSE",
  "RECEIVE_FULL",
  "RECEIVE_SHORT",
  "RECEIVE_SHORT_WAIT",
] as const;
export type PurchaseCommand = (typeof PURCHASE_COMMANDS)[number];

export interface OrderState {
  code: string;
  status: PurchaseStatus;
  outcome: PurchaseOutcome | null;
  hasReceipts: boolean;
  lineCount: number;
  expectedDate: string | null;
}

export interface OrderStatusChange {
  status: PurchaseStatus;
  outcome: PurchaseOutcome | null;
}

/** Trimmed reason, required for a cancel; too long is refused. */
export function endReason(
  reason: string | null | undefined,
  required: boolean,
): string | null {
  const text = (reason ?? "").trim();
  if (text === "") {
    if (required) throw new DomainValueError(PURCHASE_MESSAGES.cancelReason);
    return null;
  }
  if (text.length > END_REASON_MAX) {
    throw new DomainValueError(PURCHASE_MESSAGES.reasonTooLong);
  }
  return text;
}

/**
 * The status an order moves to (design D2). Anything not in the table is
 * refused with the message the spec names; the caller then writes nothing.
 */
export function transition(
  order: OrderState,
  command: PurchaseCommand,
  reason?: string | null,
): OrderStatusChange {
  if (order.status === "DONE") {
    throw new DomainValueError(PURCHASE_MESSAGES.done(order.code));
  }
  if (command === "PLACE") {
    if (order.status !== "DRAFT") {
      throw new DomainValueError(PURCHASE_MESSAGES.placed(order.code));
    }
    if (order.lineCount === 0) {
      throw new PurchaseFieldError(PURCHASE_MESSAGES.noLines, "lines");
    }
    if (!order.expectedDate) {
      throw new PurchaseFieldError(PURCHASE_MESSAGES.noDate, "expectedDate");
    }
    return { status: "IN_PROGRESS", outcome: null };
  }
  if (order.status === "DRAFT") {
    throw new DomainValueError(PURCHASE_MESSAGES.notPlaced(order.code));
  }
  switch (command) {
    case "CANCEL":
      if (order.hasReceipts) {
        throw new DomainValueError(PURCHASE_MESSAGES.cancelReceived);
      }
      endReason(reason, true);
      return { status: "DONE", outcome: "CANCELLED" };
    case "CLOSE":
      if (!order.hasReceipts) {
        throw new DomainValueError(PURCHASE_MESSAGES.closeNoReceipts);
      }
      endReason(reason, false);
      return { status: "DONE", outcome: "CLOSED" };
    case "RECEIVE_FULL":
      return { status: "DONE", outcome: "RECEIVED" };
    case "RECEIVE_SHORT":
      return { status: "DONE", outcome: "CLOSED" };
    case "RECEIVE_SHORT_WAIT":
      return { status: "IN_PROGRESS", outcome: null };
  }
}

/** What an edit may change (design D6). */
export type EditableFields = "ALL" | "SCHEDULE" | "NONE";

export function editableFields(
  order: Pick<OrderState, "status" | "hasReceipts">,
): EditableFields {
  if (order.status === "DONE") return "NONE";
  if (order.status === "IN_PROGRESS" && order.hasReceipts) return "SCHEDULE";
  return "ALL";
}
