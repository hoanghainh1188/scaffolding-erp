// Adjustment and opening-balance documents (inventory-ledger spec
// stock-adjustments, design D7, D8): line rules and the ledger lines a
// document turns into when the director approves it.
import type { BusinessDate } from "./business-date";
import { CONDITIONS, type Condition } from "./condition";
import { DomainValueError } from "./errors";
import type { MovementDraft } from "./movement";
import { assertValueDelta } from "./stock-revaluation";

export const ADJUSTMENT_KINDS = ["ADJUSTMENT", "OPENING", "REVALUE"] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

export const ADJUSTMENT_LINE_TYPES = [
  "QUANTITY",
  "CONDITION",
  "LOCATION",
  "OPENING",
  "VALUE",
] as const;
export type AdjustmentLineType = (typeof ADJUSTMENT_LINE_TYPES)[number];

export const ADJUSTMENT_LINE_TYPE_LABELS: Readonly<
  Record<AdjustmentLineType, string>
> = {
  QUANTITY: "Số lượng",
  CONDITION: "Tình trạng",
  LOCATION: "Vị trí",
  OPENING: "Tồn đầu kỳ",
  VALUE: "Giá trị",
};

export const ADJUSTMENT_KIND_LABELS: Readonly<Record<AdjustmentKind, string>> =
  {
    ADJUSTMENT: "Điều chỉnh",
    OPENING: "Tồn đầu kỳ",
    REVALUE: "Điều chỉnh giá",
  };

/** Document code prefixes: ĐC-2026-004, TĐK-2026-001, ĐCG-2026-001. */
export const ADJUSTMENT_PREFIX: Readonly<Record<AdjustmentKind, string>> = {
  ADJUSTMENT: "ĐC",
  OPENING: "TĐK",
  REVALUE: "ĐCG",
};

export const REASON_MAX = 500;

export const ADJUSTMENT_MESSAGES = {
  reason: "Nhập lý do điều chỉnh",
  returnReason: "Nhập lý do trả lại",
  reasonTooLong: `Lý do dài tối đa ${REASON_MAX} ký tự`,
  noLines: "Phiếu cần ít nhất một dòng",
  sameCondition: "Tình trạng đi và đến phải khác nhau",
  sameLocation: "Vị trí đi và đến phải khác nhau",
  quantityZero: "Số lượng điều chỉnh phải khác 0",
  moveQuantity: "Số lượng chuyển phải lớn hơn 0",
  openingQuantity: "Số lượng tồn đầu phải lớn hơn 0",
  openingCost: "Nhập đơn giá vốn (số nguyên không âm)",
  unitCost: "Đơn giá phải là số nguyên không âm",
  wrongKind: "Dòng không hợp với loại phiếu",
  openingDate: "Chọn ngày tồn đầu",
  openingFuture: "Ngày tồn đầu không được sau hôm nay",
  condition: "Chọn tình trạng",
  location: "Chọn vị trí",
} as const;

export interface AdjustmentLineInput {
  lineType: AdjustmentLineType;
  itemId: string;
  condition: Condition;
  toCondition: Condition | null;
  /** Null only on VALUE lines. */
  locationId: string | null;
  toLocationId: string | null;
  quantityMilli: number;
  unitCost: number | null;
  /** Signed change of value, VALUE lines only. */
  valueDelta: number | null;
}

/** Trimmed reason, required, at most 500 characters. */
export function normalizeReason(
  value: string | null | undefined,
  message: string = ADJUSTMENT_MESSAGES.reason,
): string {
  const reason = (value ?? "").trim();
  if (reason === "") throw new DomainValueError(message);
  if (reason.length > REASON_MAX) {
    throw new DomainValueError(ADJUSTMENT_MESSAGES.reasonTooLong);
  }
  return reason;
}

function isCondition(value: unknown): value is Condition {
  return (CONDITIONS as readonly unknown[]).includes(value);
}

function assertUnitCost(value: number | null): void {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    throw new DomainValueError(ADJUSTMENT_MESSAGES.unitCost);
  }
}

/** The shape of one line for its type and the document kind. */
export function assertAdjustmentLine(
  kind: AdjustmentKind,
  line: AdjustmentLineInput,
): void {
  if (
    (kind === "OPENING") !== (line.lineType === "OPENING") ||
    (kind === "REVALUE") !== (line.lineType === "VALUE")
  ) {
    throw new DomainValueError(ADJUSTMENT_MESSAGES.wrongKind);
  }
  if (!isCondition(line.condition)) {
    throw new DomainValueError(ADJUSTMENT_MESSAGES.condition);
  }
  if (line.lineType === "VALUE") {
    assertValueDelta(line.valueDelta ?? 0);
    return;
  }
  if (line.locationId === null) {
    throw new DomainValueError(ADJUSTMENT_MESSAGES.location);
  }
  assertUnitCost(line.unitCost);
  switch (line.lineType) {
    case "QUANTITY":
      if (line.quantityMilli === 0) {
        throw new DomainValueError(ADJUSTMENT_MESSAGES.quantityZero);
      }
      return;
    case "CONDITION":
      if (!isCondition(line.toCondition)) {
        throw new DomainValueError(ADJUSTMENT_MESSAGES.condition);
      }
      if (line.toCondition === line.condition) {
        throw new DomainValueError(ADJUSTMENT_MESSAGES.sameCondition);
      }
      if (line.quantityMilli <= 0) {
        throw new DomainValueError(ADJUSTMENT_MESSAGES.moveQuantity);
      }
      return;
    case "LOCATION":
      if (!line.toLocationId || line.toLocationId === line.locationId) {
        throw new DomainValueError(ADJUSTMENT_MESSAGES.sameLocation);
      }
      if (line.quantityMilli <= 0) {
        throw new DomainValueError(ADJUSTMENT_MESSAGES.moveQuantity);
      }
      return;
    case "OPENING":
      if (line.quantityMilli <= 0) {
        throw new DomainValueError(ADJUSTMENT_MESSAGES.openingQuantity);
      }
      if (line.unitCost === null) {
        throw new DomainValueError(ADJUSTMENT_MESSAGES.openingCost);
      }
  }
}

/** Opening date: required, not after today. */
export function assertOpeningDate(
  date: BusinessDate | null,
  today: BusinessDate,
): BusinessDate {
  if (date === null)
    throw new DomainValueError(ADJUSTMENT_MESSAGES.openingDate);
  if (date > today)
    throw new DomainValueError(ADJUSTMENT_MESSAGES.openingFuture);
  return date;
}

/**
 * The ledger lines of an approved document: a quantity line is one line,
 * a condition or location move is exactly two (out, then in), an opening
 * line is one OPENING line valued at quantity × unit cost.
 */
export function adjustmentMovements(
  code: string,
  reason: string,
  lines: readonly AdjustmentLineInput[],
): MovementDraft[] {
  if (lines.length === 0)
    throw new DomainValueError(ADJUSTMENT_MESSAGES.noLines);
  const drafts: MovementDraft[] = [];
  const description = `${code}: ${reason}`;
  for (const line of lines) {
    const base = {
      itemId: line.itemId,
      condition: line.condition,
      locationId: line.locationId,
      description,
    };
    switch (line.lineType) {
      case "VALUE":
        // REVALUE documents post through revaluationMovements.
        throw new DomainValueError(ADJUSTMENT_MESSAGES.wrongKind);
      case "QUANTITY":
        drafts.push({
          ...base,
          movement: line.quantityMilli > 0 ? "ADJUST_IN" : "ADJUST_OUT",
          quantityMilli: line.quantityMilli,
          ...(line.unitCost === null ? {} : { unitCost: line.unitCost }),
        });
        break;
      case "CONDITION":
      case "LOCATION": {
        const out = drafts.length;
        drafts.push({
          ...base,
          movement: "ADJUST_OUT",
          quantityMilli: -line.quantityMilli,
        });
        drafts.push({
          ...base,
          condition: line.toCondition ?? line.condition,
          locationId: line.toLocationId ?? line.locationId,
          movement: "ADJUST_IN",
          quantityMilli: line.quantityMilli,
          pairedWith: out,
        });
        break;
      }
      case "OPENING":
        drafts.push({
          ...base,
          movement: "OPENING",
          quantityMilli: line.quantityMilli,
          amount: Number(
            (BigInt(line.quantityMilli) * BigInt(line.unitCost ?? 0) + 500n) /
              1000n,
          ),
          description: `${code}: Tồn đầu kỳ`,
        });
    }
  }
  return drafts;
}

/** "ĐC-2026-004" */
export function formatDocumentCode(
  prefix: string,
  year: number,
  number: number,
): string {
  return `${prefix}-${year}-${String(number).padStart(3, "0")}`;
}
