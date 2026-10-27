import { DomainValueError } from "./errors";

export const PARTNER_FIELD_MESSAGES = {
  phone: "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0",
  taxCode: "Mã số thuế gồm 10 chữ số, hoặc 10 chữ số kèm -XXX cho chi nhánh",
  idNumber: "Số CCCD gồm 12 chữ số",
} as const;

const PHONE_SEPARATORS = /[\s.\-()]/g;

/** "0912.345.678" or "+84 912 345 678" → "0912345678". */
export function normalizePhone(input: string): string {
  let digits = input.replace(PHONE_SEPARATORS, "");
  if (digits.startsWith("+84")) digits = `0${digits.slice(3)}`;
  if (!/^0\d{9}$/.test(digits)) {
    throw new DomainValueError(PARTNER_FIELD_MESSAGES.phone);
  }
  return digits;
}

/** "0912345678" → "0912 345 678". */
export function formatPhone(phone: string): string {
  return /^\d{10}$/.test(phone)
    ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`
    : phone;
}

/** 10 digits, or 10 digits and -XXX for a branch (0109876543-001). */
export function isValidTaxCode(taxCode: string): boolean {
  return /^\d{10}(-\d{3})?$/.test(taxCode);
}

/** Căn cước công dân: 12 digits. */
export function isValidIdNumber(idNumber: string): boolean {
  return /^\d{12}$/.test(idNumber);
}

/**
 * Only the last 4 digits of a CCCD leave the edit form (master-data D5):
 * "001203012345" → "•••• •••• 2345".
 */
export function maskIdNumber(idNumber: string): string {
  return `•••• •••• ${idNumber.slice(-4)}`;
}

/**
 * A bank account number is personal data too (review of PR #28): only its
 * last 4 characters leave the edit form. "0451000312345678" → "•••• 5678".
 */
export function maskBankAccount(account: string): string {
  return `•••• ${account.replace(/\s/g, "").slice(-4)}`;
}
