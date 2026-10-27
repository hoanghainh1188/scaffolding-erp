// Goods receipts (goods-receipt spec, design D3, D6): the rules one truck
// trip must pass before it is posted, which order lines stay open for the
// next trip, and the order command a posted trip leads to. Pure.
import { CONDITIONS, type Condition } from "./condition";
import { computeConditionSplit } from "./condition-split";
import { DomainValueError } from "./errors";
import { formatQuantity, toQuantity, type QuantityUnit } from "./quantity";
import {
  PURCHASE_MESSAGES,
  PurchaseFieldError,
  type PurchaseCommand,
  type PurchaseKind,
} from "./purchase-order";

export const RECEIPT_PREFIX = "PN";
export const RECEIPT_DOCUMENT_TYPE = "GOODS_RECEIPT";

export const RECEIPT_LINE_STATUSES = ["COUNTED", "NOT_IN_TRIP"] as const;
export type ReceiptLineStatus = (typeof RECEIPT_LINE_STATUSES)[number];

export const RECEIPT_MESSAGES = {
  notFound: "Không tìm thấy phiếu nhập",
  orderDone: (code: string) => `Đơn ${code} đã xong, không nhập thêm được`,
  orderChanged: (code: string) =>
    `Đơn ${code} vừa thay đổi, mở lại đơn để đếm theo số mới`,
  missingLines: (count: number) =>
    `Còn ${count} mã chưa đếm hoặc đánh dấu "Chuyến này không có"`,
  nothingCounted: "Chuyến này chưa nhận mã nào",
  countedZero: 'Số đếm bằng 0 thì chọn "Chuyến này không có"',
  weighedMissing: "Nhập số kg cân thực tế",
  splitUnder: (left: string) => `Còn ${left} chưa phân loại`,
  splitOver: (extra: string) => `Vượt ${extra} so với tổng`,
  newOnly: "Đơn hàng mới nhập hết vào tình trạng Mới",
  kgToScrap: (code: string) =>
    `${code} tính theo kg, nhập thẳng vào tình trạng Phế liệu`,
  usedNoNew: "Đơn hàng cũ không nhập vào tình trạng Mới",
  notInTripCount: 'Dòng "Chuyến này không có" phải ghi 0',
  draftOfOther: "Mã nháp này đã dùng cho phiếu của người khác",
  closedShort: "Nhận thiếu, không chờ giao bù",
  noYard: "Chưa có bãi đang dùng để nhập hàng",
  yardMissing: "Chọn bãi nhập hàng",
} as const;

/** The order changed under the phone (design D5): HTTP 409, not a form error. */
export class ReceiptConflictError extends DomainValueError {}

/** One order line as receiving sees it, quantities in thousandths. */
export interface ReceivingLine {
  readonly orderLineId: string;
  readonly itemCode: string;
  /** Unit the item is stocked in. */
  readonly itemUnit: QuantityUnit;
  /** Unit the order line is priced in. */
  readonly lineUnit: QuantityUnit;
  readonly standardWeightKg: string | null;
  /** Ordered, in the line unit. */
  readonly orderedMilli: number;
  /** Received on earlier receipts, in the line unit. */
  readonly receivedMilli: number;
  /** awaits_rest of the latest receipt line, null when no receipt had it. */
  readonly lastAwaitsRest: boolean | null;
}

export type ConditionSplit = Readonly<Record<Condition, number>>;

/** One line of a receipt as the phone sends it, in thousandths. */
export interface ReceiptLineInput {
  readonly orderLineId: string;
  readonly status: ReceiptLineStatus;
  /** In the item unit (pieces counted, or kg weighed for a kg item). */
  readonly quantityMilli: number;
  /** Weighed kg of a kg line of a piece item; null otherwise. */
  readonly weighedKgMilli: number | null;
  readonly split: ConditionSplit;
  readonly awaitsRest: boolean;
}

export const EMPTY_SPLIT: ConditionSplit = {
  NEW: 0,
  GOOD: 0,
  NEEDS_REPAIR: 0,
  SCRAP: 0,
};

/** The item unit needs kg weighed besides the count: a kg line of a piece item. */
export function needsWeighing(
  line: Pick<ReceivingLine, "itemUnit" | "lineUnit">,
): boolean {
  return line.lineUnit === "KG" && line.itemUnit === "PIECE";
}

/** What this trip adds to the line, in the line unit (design D3). */
export function receivedInLineUnit(
  open: Pick<ReceivingLine, "itemUnit" | "lineUnit">,
  line: Pick<ReceiptLineInput, "status" | "quantityMilli" | "weighedKgMilli">,
): number {
  if (line.status === "NOT_IN_TRIP") return 0;
  return needsWeighing(open) ? (line.weighedKgMilli ?? 0) : line.quantityMilli;
}

/**
 * Open = not fully received and either never on a receipt or still awaited
 * on the latest one (design D6). A line closed short stays closed.
 */
export function isOpenLine(
  line: Pick<
    ReceivingLine,
    "orderedMilli" | "receivedMilli" | "lastAwaitsRest"
  >,
): boolean {
  return (
    line.receivedMilli < line.orderedMilli && line.lastAwaitsRest !== false
  );
}

export function openLines(
  lines: readonly ReceivingLine[],
): readonly ReceivingLine[] {
  return lines.filter(isOpenLine);
}

function checkSplit(
  kind: PurchaseKind,
  open: ReceivingLine,
  line: ReceiptLineInput,
  field: string,
): void {
  const parts = CONDITIONS.map((condition) => line.split[condition]);
  if (parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new PurchaseFieldError(PURCHASE_MESSAGES.quantity, `${field}.split`);
  }
  const unit = open.itemUnit;
  const result = computeConditionSplit(
    toQuantity(line.quantityMilli, unit),
    parts.map((part) => toQuantity(part, unit)),
  );
  if (result.status === "under") {
    throw new PurchaseFieldError(
      RECEIPT_MESSAGES.splitUnder(formatQuantity(result.remaining)),
      `${field}.split`,
    );
  }
  if (result.status === "over") {
    throw new PurchaseFieldError(
      RECEIPT_MESSAGES.splitOver(
        formatQuantity(toQuantity(-result.remaining.milli, unit)),
      ),
      `${field}.split`,
    );
  }
  if (kind === "NEW") {
    if (line.split.NEW !== line.quantityMilli) {
      throw new PurchaseFieldError(RECEIPT_MESSAGES.newOnly, `${field}.split`);
    }
    return;
  }
  if (open.itemUnit === "KG" && line.split.SCRAP !== line.quantityMilli) {
    throw new PurchaseFieldError(
      RECEIPT_MESSAGES.kgToScrap(open.itemCode),
      `${field}.split`,
    );
  }
  if (line.split.NEW !== 0) {
    throw new PurchaseFieldError(RECEIPT_MESSAGES.usedNoNew, `${field}.split`);
  }
}

function checkCountedLine(
  kind: PurchaseKind,
  open: ReceivingLine,
  line: ReceiptLineInput,
  field: string,
): void {
  if (!Number.isInteger(line.quantityMilli) || line.quantityMilli < 0) {
    throw new PurchaseFieldError(
      PURCHASE_MESSAGES.quantity,
      `${field}.quantity`,
    );
  }
  if (line.quantityMilli === 0) {
    throw new PurchaseFieldError(
      RECEIPT_MESSAGES.countedZero,
      `${field}.quantity`,
    );
  }
  if (open.itemUnit === "PIECE" && line.quantityMilli % 1000 !== 0) {
    throw new PurchaseFieldError(
      PURCHASE_MESSAGES.wholePieces(open.itemCode),
      `${field}.quantity`,
    );
  }
  if (needsWeighing(open)) {
    const kg = line.weighedKgMilli;
    if (kg === null || !Number.isInteger(kg) || kg <= 0) {
      throw new PurchaseFieldError(
        RECEIPT_MESSAGES.weighedMissing,
        `${field}.weighedKg`,
      );
    }
  }
  checkSplit(kind, open, line, field);
}

/**
 * Checks a receipt against the open lines of its order (spec "Mọi dòng còn
 * mở phải đếm hoặc đánh dấu", "Đơn vị khi nhận hàng", "Tách tình trạng").
 * A line the order does not expect is a conflict (409); anything else is a
 * field error on the line (422).
 */
export function checkReceiptLines(
  orderCode: string,
  kind: PurchaseKind,
  open: readonly ReceivingLine[],
  lines: readonly ReceiptLineInput[],
): void {
  const byId = new Map(open.map((line) => [line.orderLineId, line]));
  const seen = new Set<string>();
  for (const line of lines) {
    if (!byId.has(line.orderLineId) || seen.has(line.orderLineId)) {
      throw new ReceiptConflictError(RECEIPT_MESSAGES.orderChanged(orderCode));
    }
    seen.add(line.orderLineId);
  }
  const missing = open.filter((line) => !seen.has(line.orderLineId)).length;
  if (missing > 0) {
    throw new PurchaseFieldError(
      RECEIPT_MESSAGES.missingLines(missing),
      "lines",
    );
  }
  lines.forEach((line, index) => {
    const field = `lines.${index}`;
    const info = byId.get(line.orderLineId) as ReceivingLine;
    if (line.status === "NOT_IN_TRIP") {
      const parts = CONDITIONS.some((c) => line.split[c] !== 0);
      if (line.quantityMilli !== 0 || line.weighedKgMilli !== null || parts) {
        throw new PurchaseFieldError(
          RECEIPT_MESSAGES.notInTripCount,
          `${field}.quantity`,
        );
      }
      return;
    }
    checkCountedLine(kind, info, line, field);
  });
  if (!lines.some((line) => line.status === "COUNTED")) {
    throw new PurchaseFieldError(RECEIPT_MESSAGES.nothingCounted, "lines");
  }
}

/** awaits_rest as stored: only a line still short after the trip waits. */
export function storedAwaitsRest(
  open: ReceivingLine,
  line: ReceiptLineInput,
): boolean {
  const after = open.receivedMilli + receivedInLineUnit(open, line);
  return line.awaitsRest && after < open.orderedMilli;
}

/** The order lines after a trip, for orderCommandAfterReceipt. */
export function linesAfterTrip(
  all: readonly ReceivingLine[],
  lines: readonly ReceiptLineInput[],
): ReceivingLine[] {
  const byId = new Map(lines.map((line) => [line.orderLineId, line]));
  return all.map((open) => {
    const line = byId.get(open.orderLineId);
    if (!line) return open;
    return {
      ...open,
      receivedMilli: open.receivedMilli + receivedInLineUnit(open, line),
      lastAwaitsRest: storedAwaitsRest(open, line),
    };
  });
}

/** The order command after a trip (design D6). */
export function orderCommandAfterReceipt(
  after: readonly ReceivingLine[],
): Extract<
  PurchaseCommand,
  "RECEIVE_FULL" | "RECEIVE_SHORT" | "RECEIVE_SHORT_WAIT"
> {
  if (after.every((line) => line.receivedMilli >= line.orderedMilli)) {
    return "RECEIVE_FULL";
  }
  if (after.some(isOpenLine)) return "RECEIVE_SHORT_WAIT";
  return "RECEIVE_SHORT";
}
