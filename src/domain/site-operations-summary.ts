// Texts of site transfers, buy-backs and exchanges (site-operations design
// D12): the activity-log rows and the lines of D6, M1 and M7.
import { joinParts } from "./activity-summary";
import { amountsText, type NamedAmount } from "./delivery-summary";
import { formatMoney, toMoney } from "./money";
import { formatByUnit, sumByUnit, type UnitAmount } from "./quantity";

/** "An Phú – Block B → Trường THCS Dương Nội". */
export const routeText = (from: string, to: string): string =>
  `${from} → ${to}`;

export interface MovedAmount extends NamedAmount {
  plannedMilli: number;
}

/** "chở ít hơn 4 cái" when the truck carried less than the office wrote. */
function shortText(lines: readonly MovedAmount[]): string | null {
  const short = lines
    .filter((line) => line.plannedMilli > line.milli)
    .map((line) => ({
      unit: line.unit,
      milli: line.plannedMilli - line.milli,
    }));
  return short.length === 0
    ? null
    : `chở ít hơn ${formatByUnit(sumByUnit(short))}`;
}

/** Ghi sổ: "An Phú – Block B → Dương Nội · 50 khung, 36 chéo · chở ít hơn 4 cái". */
export function postedTransferSummary(
  from: string,
  to: string,
  lines: readonly MovedAmount[],
): string {
  const moved = lines.filter((line) => line.milli > 0);
  return joinParts(routeText(from, to), amountsText(moved), shortText(lines));
}

/** Tạo / Gửi điện thoại: "An Phú – Block B → Dương Nội · 50 khung, 40 chéo". */
export function plannedTransferSummary(
  from: string,
  to: string,
  lines: readonly NamedAmount[],
): string {
  return joinParts(routeText(from, to), amountsText(lines));
}

/** Duyệt: "Mua lại 20 ty, 50 bát · 1.300.000 ₫". */
export function buyBackSummary(
  lines: readonly NamedAmount[],
  total: number,
): string {
  return joinParts(
    `Mua lại ${amountsText(lines)}`,
    formatMoney(toMoney(total)),
  );
}

/**
 * Tạo đợt của đổi hàng: "Đổi hàng · Đợt 4 · giao 100 CHEO1,2 · nhận về dự
 * kiến 100 CHEO1,7". Names clash between the two sides fall back to codes.
 */
export function exchangeSummary(
  batchNo: number,
  given: readonly NamedAmount[],
  expected: readonly NamedAmount[],
): string {
  const all = amountsText([...given, ...expected]).split(", ");
  return joinParts(
    "Đổi hàng",
    `Đợt ${batchNo}`,
    `giao ${all.slice(0, given.length).join(", ")}`,
    `nhận về dự kiến ${all.slice(given.length).join(", ")}`,
  );
}

/** "86 cái" of a transfer on M1, M7 and D6. */
export const transferTotalText = (lines: readonly UnitAmount[]): string =>
  formatByUnit(sumByUnit(lines));
