import { describe, expect, it } from "vitest";

import {
  PARTNER_FIELD_MESSAGES,
  formatPhone,
  isValidIdNumber,
  isValidTaxCode,
  maskBankAccount,
  maskIdNumber,
  normalizePhone,
} from "./partner-fields";

describe("phones", () => {
  it.each([
    ["0912.345.678", "0912345678"],
    ["0912 345 678", "0912345678"],
    ["+84 912 345 678", "0912345678"],
    ["091-234-5678", "0912345678"],
  ])("%s → %s", (input, stored) => {
    expect(normalizePhone(input)).toBe(stored);
  });

  it.each(["091234567", "1912345678", "09123456789", "abc"])(
    "rejects %s",
    (input) => {
      expect(() => normalizePhone(input)).toThrow(PARTNER_FIELD_MESSAGES.phone);
    },
  );

  it("shows 0912 345 678", () => {
    expect(formatPhone("0912345678")).toBe("0912 345 678");
  });
});

describe("tax codes and ID numbers", () => {
  it("accepts a company and a branch tax code", () => {
    expect(isValidTaxCode("0109876543")).toBe(true);
    expect(isValidTaxCode("0109876543-001")).toBe(true);
    expect(isValidTaxCode("01098765")).toBe(false);
    expect(isValidTaxCode("0109876543-1")).toBe(false);
  });

  it("accepts 12-digit CCCD only", () => {
    expect(isValidIdNumber("001203012345")).toBe(true);
    expect(isValidIdNumber("0012030123")).toBe(false);
  });

  it("masks a bank account down to its last 4 characters", () => {
    expect(maskBankAccount("0451 0003 1234 5678")).toBe("•••• 5678");
    expect(maskBankAccount("123")).toBe("•••• 123");
  });

  it("masks all but the last 4 digits", () => {
    expect(maskIdNumber("001203012345")).toBe("•••• •••• 2345");
  });
});
