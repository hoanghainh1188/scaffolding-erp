import { describe, expect, it } from "vitest";

import {
  COMPANY_MESSAGES,
  companyProfileInputSchema,
} from "./company";

describe("companyProfileInputSchema", () => {
  it("accepts valid full company profile input", () => {
    const input = {
      name: "Công ty Cổ phần Cơ khí Xây dựng An Phát",
      shortName: "An Phát JSC",
      taxId: "0101234567-001",
      address: "123 Đường Giải Phóng, Hà Nội",
      phone: "0901234567",
      email: "contact@anphat.vn",
      website: "https://anphat.vn",
      bankAccount: "1903123456789",
      bankName: "Techcombank - Chi nhánh Thăng Long",
      logoUrl: "https://anphat.vn/logo.png",
    };
    const parsed = companyProfileInputSchema.parse(input);
    expect(parsed.name).toBe("Công ty Cổ phần Cơ khí Xây dựng An Phát");
    expect(parsed.taxId).toBe("0101234567-001");
  });

  it("accepts minimal profile with only name and converts blanks to null", () => {
    const input = {
      name: "  Công ty TNHH Giàn giáo Việt Nam  ",
      shortName: "   ",
      taxId: "",
      address: null,
      phone: undefined,
    };
    const parsed = companyProfileInputSchema.parse(input);
    expect(parsed.name).toBe("Công ty TNHH Giàn giáo Việt Nam");
    expect(parsed.shortName).toBeNull();
    expect(parsed.taxId).toBeNull();
    expect(parsed.address).toBeNull();
    expect(parsed.phone).toBeNull();
  });

  it("rejects empty name", () => {
    const result = companyProfileInputSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        COMPANY_MESSAGES.nameRequired,
      );
    }
  });

  it("rejects invalid tax ID", () => {
    const result = companyProfileInputSchema.safeParse({
      name: "Công ty A",
      taxId: "12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = companyProfileInputSchema.safeParse({
      name: "Công ty A",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        COMPANY_MESSAGES.emailInvalid,
      );
    }
  });

  it("rejects invalid phone format", () => {
    const result = companyProfileInputSchema.safeParse({
      name: "Công ty A",
      phone: "123", // too short (<8)
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        COMPANY_MESSAGES.phoneInvalid,
      );
    }
  });

  it("accepts small base64 logo and rejects oversized logo (>500KB)", () => {
    const smallLogo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    expect(
      companyProfileInputSchema.parse({
        name: "Công ty A",
        logoUrl: smallLogo,
      }).logoUrl,
    ).toBe(smallLogo);

    // Over 500KB base64 string
    const bigData = "A".repeat(800 * 1024);
    const bigLogo = `data:image/png;base64,${bigData}`;
    const result = companyProfileInputSchema.safeParse({
      name: "Công ty A",
      logoUrl: bigLogo,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        COMPANY_MESSAGES.logoTooLarge,
      );
    }
  });
});
