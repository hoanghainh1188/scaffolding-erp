import { DomainValueError } from "./errors";

/** Whole Vietnamese đồng. Created only through toMoney / parseMoney. */
export type Money = number & { readonly __brand: "Money" };

const groupFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 0,
  useGrouping: true,
});

/** Validates an amount: a safe integer, possibly negative (adjustments). */
export function toMoney(value: number): Money {
  if (!Number.isFinite(value)) {
    throw new DomainValueError("Số tiền không hợp lệ");
  }
  if (!Number.isInteger(value)) {
    throw new DomainValueError("Số tiền phải là số nguyên");
  }
  if (!Number.isSafeInteger(value)) {
    throw new DomainValueError("Số tiền vượt giới hạn");
  }
  return value as Money;
}

/** "1.250.000 ₫" */
export function formatMoney(value: Money): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}${groupFormatter.format(Math.abs(value))} ₫`;
}

/** "1250000": the string put in an input while the user edits it. */
export function formatMoneyForInput(value: Money): string {
  return String(value);
}

const SPACES_AND_CURRENCY = /[\s  ₫đ]/gu;
const PLAIN_INTEGER = /^-?\d+$/;
const DOT_GROUPED_INTEGER = /^-?\d{1,3}(\.\d{3})+$/;
const DECIMAL_AMOUNT = /^-?[\d.]+,\d+$/;

/** Reads "1.250.000", "1250000" or "1.250.000 ₫". */
export function parseMoney(input: string): Money {
  const compact = input.replace(SPACES_AND_CURRENCY, "");
  if (PLAIN_INTEGER.test(compact)) {
    return toMoney(Number(compact));
  }
  if (DOT_GROUPED_INTEGER.test(compact)) {
    return toMoney(Number(compact.replaceAll(".", "")));
  }
  if (DECIMAL_AMOUNT.test(compact)) {
    throw new DomainValueError("Số tiền phải là số nguyên");
  }
  throw new DomainValueError("Số tiền không hợp lệ");
}
