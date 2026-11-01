// Vietnamese Tax ID (Mã số thuế doanh nghiệp - MST) domain rules.
// Follows Circular 105/2020/TT-BTC:
// - 10-digit tax code for enterprises: ^\d{10}$
// - 13-digit tax code for branches / dependent units: ^\d{10}-\d{3}$ or ^\d{13}$
import { DomainValueError } from "./errors";

const TAX_ID_10 = /^\d{10}$/;
const TAX_ID_13_DASH = /^(\d{10})-(\d{3})$/;
const TAX_ID_13_PLAIN = /^(\d{13})$/;

export const TAX_ID_ERROR_MESSAGE =
  "Mã số thuế phải gồm 10 chữ số hoặc 13 chữ số (VD: 0101234567 hoặc 0101234567-001)";

/**
 * Checks whether a trimmed string is a valid Vietnamese enterprise tax code.
 */
export function isValidTaxId(value: string): boolean {
  const trimmed = value.trim();
  return (
    TAX_ID_10.test(trimmed) ||
    TAX_ID_13_DASH.test(trimmed) ||
    TAX_ID_13_PLAIN.test(trimmed)
  );
}

/**
 * Normalizes a tax code by trimming whitespace and formatting 13-digit codes with a dash.
 */
export function normalizeTaxId(value: string): string {
  const trimmed = value.trim();
  if (!isValidTaxId(trimmed)) {
    throw new DomainValueError(TAX_ID_ERROR_MESSAGE);
  }
  if (TAX_ID_13_PLAIN.test(trimmed)) {
    return `${trimmed.slice(0, 10)}-${trimmed.slice(10)}`;
  }
  return trimmed;
}
