// Bank guarantee warnings (contracts design D12, 0.2 #50): 30 days before
// expiry, once expired, and when it ends before the rental is expected to
// end. Warnings only; nothing is blocked.
import {
  addDays,
  daysBetween,
  formatBusinessDate,
  type BusinessDate,
} from "./business-date";

export const GUARANTEE_WARNING_DAYS = 30;

export type GuaranteeWarningKind =
  "EXPIRING" | "EXPIRED" | "ENDS_BEFORE_CONTRACT";

export interface GuaranteeWarning {
  kind: GuaranteeWarningKind;
  message: string;
}

export interface GuaranteeInput {
  guaranteeNumber: string;
  expiryDate: BusinessDate;
  /** Today in Asia/Ho_Chi_Minh. */
  today: BusinessDate;
  /** Expected end of a rental; null for a sale. */
  contractEndDate: BusinessDate | null;
}

/** The warnings of one guarantee, in this order: expired/expiring, then end. */
export function guaranteeWarnings({
  guaranteeNumber,
  expiryDate,
  today,
  contractEndDate,
}: GuaranteeInput): GuaranteeWarning[] {
  const warnings: GuaranteeWarning[] = [];
  const left = daysBetween(today, expiryDate);
  const expiry = formatBusinessDate(expiryDate);
  if (left < 0) {
    warnings.push({
      kind: "EXPIRED",
      message: `Bảo lãnh ${guaranteeNumber} đã hết hạn ngày ${expiry}`,
    });
  } else if (left <= GUARANTEE_WARNING_DAYS) {
    warnings.push({
      kind: "EXPIRING",
      message: `Bảo lãnh ${guaranteeNumber} còn ${left} ngày (hết hạn ${expiry})`,
    });
  }
  if (contractEndDate !== null && expiryDate < contractEndDate) {
    warnings.push({
      kind: "ENDS_BEFORE_CONTRACT",
      message: `Bảo lãnh ${guaranteeNumber} hết hạn ${expiry}, trước ngày kết thúc dự kiến ${formatBusinessDate(contractEndDate)}`,
    });
  }
  return warnings;
}

/** "Nhắc trước 30 ngày: 01/03/2027" on D5a. */
export function reminderDate(expiryDate: BusinessDate): BusinessDate {
  return addDays(expiryDate, -GUARANTEE_WARNING_DAYS);
}
