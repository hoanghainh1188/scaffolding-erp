import { describe, expect, it } from "vitest";

import { isValidTaxId, normalizeTaxId, TAX_ID_ERROR_MESSAGE } from "./tax-id";

describe("tax-id domain validation", () => {
  it("accepts valid 10-digit tax IDs", () => {
    expect(isValidTaxId("0101234567")).toBe(true);
    expect(isValidTaxId("  0309876543  ")).toBe(true);
    expect(normalizeTaxId("  0101234567  ")).toBe("0101234567");
  });

  it("accepts valid 13-digit tax IDs with hyphen", () => {
    expect(isValidTaxId("0101234567-001")).toBe(true);
    expect(normalizeTaxId("0101234567-001")).toBe("0101234567-001");
  });

  it("accepts valid 13-digit tax IDs without hyphen and normalizes with hyphen", () => {
    expect(isValidTaxId("0101234567001")).toBe(true);
    expect(normalizeTaxId("0101234567001")).toBe("0101234567-001");
  });

  it("rejects invalid tax IDs", () => {
    expect(isValidTaxId("")).toBe(false);
    expect(isValidTaxId("12345")).toBe(false);
    expect(isValidTaxId("01012345678")).toBe(false); // 11 digits
    expect(isValidTaxId("0101234567-01")).toBe(false); // 2 suffix digits
    expect(isValidTaxId("ABC1234567")).toBe(false);
    expect(() => normalizeTaxId("invalid")).toThrow(TAX_ID_ERROR_MESSAGE);
  });
});
