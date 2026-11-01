// Company profile domain logic & validation (spec company-settings, K10).
import { z } from "zod";

import { isValidTaxId, normalizeTaxId, TAX_ID_ERROR_MESSAGE } from "./tax-id";

export const MAX_LOGO_SIZE_BYTES = 500 * 1024; // 500 KB

export const COMPANY_MESSAGES = {
  nameRequired: "Tên công ty không được để trống",
  nameTooLong: "Tên công ty không được vượt quá 255 ký tự",
  shortNameTooLong: "Tên viết tắt không được vượt quá 50 ký tự",
  addressTooLong: "Địa chỉ không được vượt quá 500 ký tự",
  phoneInvalid: "Số điện thoại phải từ 8 đến 20 ký tự số/dấu cách/dấu gạch",
  emailInvalid: "Địa chỉ email không hợp lệ",
  websiteTooLong: "Địa chỉ website không được vượt quá 255 ký tự",
  bankAccountTooLong: "Số tài khoản ngân hàng không được vượt quá 50 ký tự",
  bankNameTooLong: "Tên ngân hàng không được vượt quá 200 ký tự",
  logoTooLarge: "Ảnh logo không được vượt quá 500 KB",
} as const;

const PHONE_REGEX = /^[0-9+\s().-]{8,20}$/;

function cleanString(val: unknown): string | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const companyProfileInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, COMPANY_MESSAGES.nameRequired)
    .max(255, COMPANY_MESSAGES.nameTooLong),
  shortName: z
    .string()
    .max(50, COMPANY_MESSAGES.shortNameTooLong)
    .nullish()
    .transform(cleanString),
  taxId: z
    .string()
    .nullish()
    .transform(cleanString)
    .refine((val) => val === null || isValidTaxId(val), {
      message: TAX_ID_ERROR_MESSAGE,
    })
    .transform((val) => (val ? normalizeTaxId(val) : null)),
  address: z
    .string()
    .max(500, COMPANY_MESSAGES.addressTooLong)
    .nullish()
    .transform(cleanString),
  phone: z
    .string()
    .nullish()
    .transform(cleanString)
    .refine((val) => val === null || PHONE_REGEX.test(val), {
      message: COMPANY_MESSAGES.phoneInvalid,
    }),
  email: z
    .string()
    .nullish()
    .transform(cleanString)
    .refine(
      (val) => val === null || z.string().email().safeParse(val).success,
      {
        message: COMPANY_MESSAGES.emailInvalid,
      },
    ),
  website: z
    .string()
    .max(255, COMPANY_MESSAGES.websiteTooLong)
    .nullish()
    .transform(cleanString),
  bankAccount: z
    .string()
    .max(50, COMPANY_MESSAGES.bankAccountTooLong)
    .nullish()
    .transform(cleanString),
  bankName: z
    .string()
    .max(200, COMPANY_MESSAGES.bankNameTooLong)
    .nullish()
    .transform(cleanString),
  logoUrl: z
    .string()
    .nullish()
    .transform(cleanString)
    .refine(
      (val) => {
        if (!val) return true;
        if (val.startsWith("data:")) {
          // Approximate raw byte size for base64 data URLs
          const commaIndex = val.indexOf(",");
          if (commaIndex === -1) return false;
          const base64Data = val.slice(commaIndex + 1);
          const byteLength = (base64Data.length * 3) / 4;
          return byteLength <= MAX_LOGO_SIZE_BYTES;
        }
        return true;
      },
      { message: COMPANY_MESSAGES.logoTooLarge },
    ),
});

export type CompanyProfileInput = z.infer<typeof companyProfileInputSchema>;

export interface CompanyProfile {
  name: string;
  shortName: string | null;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  bankAccount: string | null;
  bankName: string | null;
  logoUrl: string | null;
  updatedBy: string | null;
  updatedAt: string;
}
