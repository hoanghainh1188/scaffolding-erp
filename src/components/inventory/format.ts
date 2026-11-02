import { formatMoney, toMoney } from "@/domain/money";
import {
  QUANTITY_UNIT_LABELS,
  QUANTITY_UNITS,
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

/**
 * "706 cái", "141 cái · 20 m": one figure per unit, in catalog order;
 * `empty` when every unit is zero.
 */
export function formatByUnit(
  byUnit: Readonly<Partial<Record<QuantityUnit, number>>>,
  empty = `0 ${QUANTITY_UNIT_LABELS.PIECE}`,
): string {
  const parts = QUANTITY_UNITS.filter((unit) => (byUnit[unit] ?? 0) !== 0).map(
    (unit) => formatStockWithUnit(byUnit[unit] ?? 0, unit),
  );
  return parts.length ? parts.join(" · ") : empty;
}

/** "195.282 ₫", or "–". */
export function formatCost(value: number | null): string {
  return value === null ? "–" : formatMoney(toMoney(value));
}

export interface ValuePreviewView {
  poolMilli: number;
  avgCost: number | null;
  value: number;
  newAvg: number | null;
  error: string | null;
}

/**
 * "Tồn 1.240 cái · Giá BQ 195.282 ₫ · Giá trị 242.149.680 ₫ → Giá BQ mới
 * 194.072 ₫", or the reason the line would be refused.
 */
export function formatValuePreview(
  preview: ValuePreviewView,
  unit: QuantityUnit,
): string {
  if (preview.error) return preview.error;
  return `Tồn ${formatStockWithUnit(preview.poolMilli, unit)} · Giá BQ ${formatCost(preview.avgCost)} · Giá trị ${formatCost(preview.value)} → Giá BQ mới ${formatCost(preview.newAvg)}`;
}
