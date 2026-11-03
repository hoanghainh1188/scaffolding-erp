// M9 numbers (spec site-transfers "Người đi xe xác nhận trên M9"): what the
// truck carried against what the office wrote, and the body sent.
import {
  formatQuantity,
  parseQuantity,
  QUANTITY_UNIT_LABELS,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import type { TransferLineView } from "@/lib/site-transfers/queries";

export interface TransferConfirmPayload {
  /** Carried, by item, as typed; missing = what the office wrote. */
  moved: Record<string, string>;
  vehiclePlate: string;
  confirmedOnDeviceAt: string | null;
  body?: object;
}

const milliOf = (text: string, unit: QuantityUnit): number => {
  try {
    return parseQuantity(text, unit).milli;
  } catch {
    return 0;
  }
};

export const plannedMilli = (line: TransferLineView): number =>
  milliOf(line.planned, line.unit);

export function movedMilli(
  line: TransferLineView,
  payload: TransferConfirmPayload,
): number {
  const text = payload.moved[line.itemId];
  return text === undefined ? plannedMilli(line) : milliOf(text, line.unit);
}

const amount = (milli: number, unit: QuantityUnit) =>
  `${formatQuantity(toQuantity(milli, unit))} ${QUANTITY_UNIT_LABELS[unit]}`;

/** "Đủ số văn phòng ghi." or "Chở ít hơn 4 cái. 4 cái còn ở An Phú." */
export function lineNote(
  line: TransferLineView,
  payload: TransferConfirmPayload,
  fromSite: string,
): string {
  const short = plannedMilli(line) - movedMilli(line, payload);
  if (short <= 0) return "Đủ số văn phòng ghi.";
  const text = amount(short, line.unit);
  return `Chở ít hơn ${text}. ${text} còn ở ${fromSite}.`;
}

/** "86 / 90 cái" when every line is in pieces. */
export function totalText(
  lines: readonly TransferLineView[],
  payload: TransferConfirmPayload,
): string {
  const unit = lines[0]?.unit ?? "PIECE";
  const moved = lines.reduce((sum, line) => sum + movedMilli(line, payload), 0);
  const planned = lines.reduce((sum, line) => sum + plannedMilli(line), 0);
  return `${formatQuantity(toQuantity(moved, unit))} / ${amount(planned, unit)}`;
}

export function postBodyOf(
  lines: readonly TransferLineView[],
  payload: TransferConfirmPayload,
  confirmedOnDeviceAt: string,
): object {
  return {
    vehiclePlate: payload.vehiclePlate.trim() || null,
    confirmedOnDeviceAt,
    lines: lines.map((line) => ({
      itemId: line.itemId,
      moved: formatQuantity(toQuantity(movedMilli(line, payload), line.unit)),
    })),
  };
}
