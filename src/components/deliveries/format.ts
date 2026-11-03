// Formatting shared by the delivery screens (D6, note detail, M5).
import { formatMoney, toMoney } from "@/domain/money";
import {
  formatQuantity,
  QUANTITY_UNIT_LABELS,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";

/** "120 cái", "1.250,5 kg". */
export function amountText(milli: number, unit: QuantityUnit): string {
  return `${formatQuantity(toQuantity(milli, unit))} ${QUANTITY_UNIT_LABELS[unit]}`;
}

/** "120" for inputs and table cells next to a unit column. */
export function numberText(milli: number, unit: QuantityUnit): string {
  return formatQuantity(toQuantity(milli, unit));
}

/** "1.800.000 ₫", or "–" when there is none. */
export function moneyText(value: number | null): string {
  return value === null ? "–" : formatMoney(toMoney(value));
}

/** "440 cái, 9 bó" from totals by unit. */
export function totalsText(
  totals: readonly { unit: QuantityUnit; milli: number }[],
): string {
  if (totals.length === 0) return amountText(0, "PIECE");
  return totals.map((row) => amountText(row.milli, row.unit)).join(", ");
}
