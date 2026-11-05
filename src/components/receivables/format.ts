// What D14 writes for statuses and amounts (receivables spec "Màn D14").
import type { BadgeTone } from "@/components/domain/tone-badge";
import { formatBusinessDate } from "@/domain/business-date";
import { formatMoney, toMoney } from "@/domain/money";
import type { CustomerStatusKind, DebtStatusKind } from "@/domain/receivables";

export const money = (value: number): string => formatMoney(toMoney(value));

/** "17/10" for due dates in tables. */
export const dayMonth = (value: string): string =>
  formatBusinessDate(value).slice(0, 5);

export const DEBT_TONES: Readonly<Record<DebtStatusKind, BadgeTone>> = {
  PAID: "success",
  OVERDUE: "destructive",
  DUE_TODAY: "warning",
  DUE_TOMORROW: "warning",
  NOT_DUE: "muted",
};

export const CUSTOMER_TONES: Readonly<Record<CustomerStatusKind, BadgeTone>> = {
  OVERDUE: "destructive",
  DUE_SOON: "warning",
  NOT_DUE: "muted",
  PREPAID: "highlight",
  CLEAR: "success",
};
