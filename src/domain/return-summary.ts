// Texts of return and compensation notes (returns-and-compensation spec
// "Nhật ký phiếu đền bù", M1, M7, D6): "trả 100 cái, mất 2 cái" and the
// activity-log rows.
import { joinParts } from "./activity-summary";
import {
  COMPENSATION_KIND_LABELS,
  type CompensationKind,
} from "./compensation";
import { formatMoney, toMoney } from "./money";
import { formatByUnit, type UnitAmount } from "./quantity";

/** "trả 100 cái, mất 2 cái"; parts with nothing are left out. */
export function returnedText(
  returned: readonly UnitAmount[],
  lost: readonly UnitAmount[],
): string {
  return joinParts(
    returned.length > 0 ? `trả ${formatByUnit(returned)}` : null,
    lost.length > 0 ? `mất ${formatByUnit(lost)}` : null,
  ).replace(" · ", ", ");
}

/** "An Phú – Block B · trả 100 cái, mất 2 cái". */
export function postedReturnSummary(
  siteName: string,
  returned: readonly UnitAmount[],
  lost: readonly UnitAmount[],
): string {
  return joinParts(siteName, returnedText(returned, lost));
}

/** "Từ PTH-2026-071 · 3.915.000 ₫ · 6 dòng". */
export function createdCompensationSummary(
  returnCode: string,
  total: number,
  lineCount: number,
): string {
  return joinParts(
    `Từ ${returnCode}`,
    formatMoney(toMoney(total)),
    `${lineCount.toLocaleString("vi-VN")} dòng`,
  );
}

const priceOrBlank = (value: number | null) =>
  value === null ? "trống" : formatMoney(toMoney(value));

/** "đơn giá MAM1,6 Mất: trống → 380.000 ₫". */
export function priceChangeText(
  itemCode: string,
  kind: CompensationKind,
  from: number | null,
  to: number | null,
): string {
  return `đơn giá ${itemCode} ${COMPENSATION_KIND_LABELS[kind]}: ${priceOrBlank(from)} → ${priceOrBlank(to)}`;
}

/** "3.500.000 ₫ (giảm 415.000 ₫: Khách quen…)", plus the overdue reason. */
export function approvedSummary(
  amountDue: number,
  discount: number,
  discountReason: string | null,
  approvalReason: string | null,
): string {
  const head =
    discount > 0
      ? `${formatMoney(toMoney(amountDue))} (giảm ${formatMoney(toMoney(discount))}: ${discountReason ?? ""})`
      : formatMoney(toMoney(amountDue));
  return joinParts(
    head,
    approvalReason ? `nợ quá hạn: ${approvalReason}` : null,
  );
}

/** `Không thu 3.915.000 ₫ · Lý do: "…"`. */
export function rejectedSummary(total: number, reason: string): string {
  return joinParts(
    `Không thu ${formatMoney(toMoney(total))}`,
    `Lý do: "${reason}"`,
  );
}
