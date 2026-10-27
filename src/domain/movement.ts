// Ledger movement types and the rules every ledger line obeys
// (inventory-ledger spec, design D2, D10).
import { formatBusinessDate, type BusinessDate } from "./business-date";
import { CONDITION_LABELS, type Condition } from "./condition";
import { DomainValueError } from "./errors";
import type { QuantityUnit } from "./quantity";

export const MOVEMENTS = [
  "OPENING",
  "PURCHASE_IN",
  "REPAIR_OUT",
  "REPAIR_IN",
  "DELIVERY_OUT",
  "DELIVERY_IN",
  "RETURN_OUT",
  "RETURN_IN",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "SALE_OUT",
  "ADJUST_OUT",
  "ADJUST_IN",
] as const;
export type Movement = (typeof MOVEMENTS)[number];

/** Stock coming in from outside the company: these change the average. */
const COST_CHANGING: ReadonlySet<Movement> = new Set([
  "OPENING",
  "PURCHASE_IN",
  "REPAIR_IN",
]);

export function changesAverage(movement: Movement): boolean {
  return COST_CHANGING.has(movement);
}

/** OPENING and every *_IN add stock; every *_OUT takes it away. */
export function isInbound(movement: Movement): boolean {
  return movement === "OPENING" || movement.endsWith("_IN");
}

export const MOVEMENT_MESSAGES = {
  zero: "Số lượng ghi sổ phải khác 0",
  inboundSign: "Dòng nhập phải có số lượng dương",
  outboundSign: "Dòng xuất phải có số lượng âm",
  wholePieces: (code: string) =>
    `${code} tính theo cái, số lượng phải là số nguyên`,
  amountMissing: "Dòng làm đổi giá vốn phải có giá trị",
  amountNotAllowed: "Chỉ tồn đầu kỳ, nhập mua, nhập sau sửa mới có giá trị",
  backdated: (code: string, condition: Condition, last: BusinessDate) =>
    `${code} ${CONDITION_LABELS[condition]} đã có biến động ngày ${formatBusinessDate(last)}, không ghi lùi ngày được`,
  future: "Ngày ghi sổ không được sau hôm nay",
} as const;

export interface MovementLineCheck {
  movement: Movement;
  itemCode: string;
  unit: QuantityUnit;
  quantityMilli: number;
  /** Given only for lines that change the average. */
  hasAmount: boolean;
}

/** Sign, whole pieces and amount rules of one ledger line. */
export function assertMovementLine(line: MovementLineCheck): void {
  if (line.quantityMilli === 0) {
    throw new DomainValueError(MOVEMENT_MESSAGES.zero);
  }
  if (isInbound(line.movement) && line.quantityMilli < 0) {
    throw new DomainValueError(MOVEMENT_MESSAGES.inboundSign);
  }
  if (!isInbound(line.movement) && line.quantityMilli > 0) {
    throw new DomainValueError(MOVEMENT_MESSAGES.outboundSign);
  }
  if (line.unit === "PIECE" && line.quantityMilli % 1000 !== 0) {
    throw new DomainValueError(MOVEMENT_MESSAGES.wholePieces(line.itemCode));
  }
  if (changesAverage(line.movement) && !line.hasAmount) {
    throw new DomainValueError(MOVEMENT_MESSAGES.amountMissing);
  }
  if (!changesAverage(line.movement) && line.hasAmount) {
    throw new DomainValueError(MOVEMENT_MESSAGES.amountNotAllowed);
  }
}

/**
 * The business date of a new line: not after today, and not before the
 * latest line of the same (item + condition), so date order is cost order.
 */
export function assertBusinessDate(input: {
  date: BusinessDate;
  today: BusinessDate;
  last: BusinessDate | null;
  itemCode: string;
  condition: Condition;
}): void {
  if (input.date > input.today) {
    throw new DomainValueError(MOVEMENT_MESSAGES.future);
  }
  if (input.last !== null && input.date < input.last) {
    throw new DomainValueError(
      MOVEMENT_MESSAGES.backdated(input.itemCode, input.condition, input.last),
    );
  }
}

/**
 * One line to post, before costs are known. postMovements fills unit cost,
 * amount and average. `amount` is given only on lines that change the
 * average; `unitCost` only to price a pair that never had a line;
 * `pairedWith` is the index of the outgoing line an incoming one mirrors.
 */
export interface MovementDraft {
  itemId: string;
  condition: Condition;
  locationId: string;
  movement: Movement;
  quantityMilli: number;
  amount?: number;
  unitCost?: number;
  pairedWith?: number;
  weighedKgMilli?: number;
  description: string;
}
