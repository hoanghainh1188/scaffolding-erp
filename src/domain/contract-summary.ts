// "Nội dung" of the activity-log rows of contracts and amendments
// (contracts spec "Nhật ký thao tác hợp đồng", contract-amendments spec).
import { countText, joinParts } from "./activity-summary";
import { formatBusinessDate } from "./business-date";
import {
  CONTRACT_TYPE_LABELS,
  type ContractType,
  type OverdueDebt,
} from "./contract";
import { formatMoney, toMoney } from "./money";

const money = (value: number) => formatMoney(toMoney(value));

export interface ContractSummaryInput {
  type: ContractType;
  customer: string;
  site: string | null;
  itemCount: number;
  /** Expected value (rental) or total (sale); null while incomplete. */
  value: number | null;
}

/** "Cho thuê · Minh Phát · Trường THCS Dương Nội · 4 mã hàng · 186.200.000 ₫" */
export function contractSummary(input: ContractSummaryInput): string {
  return joinParts(
    CONTRACT_TYPE_LABELS[input.type],
    input.customer,
    input.site ?? (input.type === "SALE" ? "Nhận hàng tại bãi" : null),
    countText(input.itemCount, "mã hàng"),
    input.value === null ? null : money(input.value),
  );
}

/** The approval row: the overdue debt and the director's reason, if any. */
export function approvalSummary(
  overdue: OverdueDebt,
  reason: string | null,
): string {
  if (overdue.amount > 0) {
    return `Nhà thầu nợ quá hạn ${money(overdue.amount)} (${overdue.days} ngày) · lý do: ${reason ?? ""}`;
  }
  return reason ? `Lý do: ${reason}` : "Hợp đồng có hiệu lực";
}

export interface AmendmentSummaryInput {
  effectiveFrom: string;
  type: ContractType;
  /** Day's rent (rental) or total (sale) before and after. */
  before: number;
  after: number;
}

/** "Hiệu lực 15/12/2026 · tiền thuê 1 ngày 1.330.000 ₫ → 1.690.000 ₫" */
export function amendmentSummary(input: AmendmentSummaryInput): string {
  const what = input.type === "RENTAL" ? "tiền thuê 1 ngày" : "tổng tiền";
  return `Hiệu lực ${formatBusinessDate(input.effectiveFrom)} · ${what} ${money(input.before)} → ${money(input.after)}`;
}
