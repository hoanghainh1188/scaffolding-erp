import { formatMoney, toMoney } from "@/domain/money";
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";

/** "1.240" or "12.850,5" from thousandths of the unit. */
export function formatStock(milli: number, unit: QuantityUnit): string {
  return formatQuantity(toQuantity(milli, unit));
}

/** "1.240 cái", "12.850,5 kg". */
export function formatStockWithUnit(milli: number, unit: QuantityUnit): string {
  return `${formatStock(milli, unit)} ${QUANTITY_UNIT_LABELS[unit]}`;
}

/** "195.282 ₫", or "–". */
export function formatCost(value: number | null): string {
  return value === null ? "–" : formatMoney(toMoney(value));
}
