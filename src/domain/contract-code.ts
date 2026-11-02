// Contract and amendment numbers (contracts design D7, 0.2 #40, #52):
// MMYYYY/<COMPANY>-<CUSTOMER>, "-2", "-3" for the next contracts of the
// same base, "/01", "/02" for amendments. The counting itself is done in the
// caller's transaction (src/lib/contracts/numbering.ts).
import { DomainValueError } from "./errors";

const MAX_TOKEN = 20;

export const CODE_MESSAGES = {
  empty:
    "Phần tên khách cần ít nhất một chữ hoặc số (VD MINHPHAT). Bạn gõ lại phần tên khách.",
  tooLong: `Phần tên khách dài tối đa ${MAX_TOKEN} ký tự. Bạn viết tắt ngắn hơn.`,
  noCompanyShort:
    "Công ty chưa có tên viết tắt nên chưa đặt được số hợp đồng. Giám đốc điền tên viết tắt ở Cài đặt → Công ty.",
} as const;

/** "An Phát" → "ANPHAT": no accents (Đ → D), upper case, A–Z and 0–9 only. */
export function codeToken(text: string): string {
  const plain = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (plain === "") throw new DomainValueError(CODE_MESSAGES.empty);
  if (plain.length > MAX_TOKEN) {
    throw new DomainValueError(CODE_MESSAGES.tooLong);
  }
  return plain;
}

export interface CodeBaseParts {
  /** 1–12, from the contract's start date (0.2 #52). */
  month: number;
  year: number;
  companyShort: string;
  customerToken: string;
}

/** "112026/ANPHAT-MINHPHAT" */
export function contractCodeBase({
  month,
  year,
  companyShort,
  customerToken,
}: CodeBaseParts): string {
  return `${String(month).padStart(2, "0")}${year}/${companyShort}-${customerToken}`;
}

/** The n-th contract of a base: no suffix for the first, "-n" after. */
export function contractCode(base: string, n: number): string {
  return n <= 1 ? base : `${base}-${n}`;
}

/** "112026/ANPHAT-MINHPHAT/01" */
export function amendmentCode(code: string, n: number): string {
  return `${code}/${String(n).padStart(2, "0")}`;
}

/** The customer's last token, else its code without the dash ("NT0003"). */
export function defaultCustomerToken(
  customerCode: string,
  lastToken: string | null,
): string {
  return lastToken ?? codeToken(customerCode);
}
