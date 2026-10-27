import { DomainValueError } from "./errors";

export const CATALOG_CODE_MIN_LENGTH = 2;
export const CATALOG_CODE_MAX_LENGTH = 20;

// Upper-case letters and digits in groups joined by single dashes: GG-K17.
// The QR label carries exactly this string (master-data design D8).
const CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export const ITEM_CODE_MESSAGES = {
  format: "Mã chỉ gồm chữ in hoa không dấu, số và dấu gạch ngang",
  length: `Mã dài từ ${CATALOG_CODE_MIN_LENGTH} đến ${CATALOG_CODE_MAX_LENGTH} ký tự`,
} as const;

/** "gg-k17 " → "GG-K17": the user may type lower case. */
export function normalizeCatalogCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidCatalogCode(code: string): boolean {
  return (
    code.length >= CATALOG_CODE_MIN_LENGTH &&
    code.length <= CATALOG_CODE_MAX_LENGTH &&
    CODE_PATTERN.test(code)
  );
}

/** Normalizes and checks a typed code (items, kits, yards, workshops). */
export function parseCatalogCode(input: string): string {
  const code = normalizeCatalogCode(input);
  if (!CODE_PATTERN.test(code)) {
    throw new DomainValueError(ITEM_CODE_MESSAGES.format);
  }
  if (!isValidCatalogCode(code)) {
    throw new DomainValueError(ITEM_CODE_MESSAGES.length);
  }
  return code;
}
