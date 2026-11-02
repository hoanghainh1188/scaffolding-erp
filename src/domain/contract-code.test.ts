import { describe, expect, it } from "vitest";

import {
  amendmentCode,
  CODE_MESSAGES,
  codeToken,
  contractCode,
  contractCodeBase,
  defaultCustomerToken,
} from "./contract-code";

describe("codeToken", () => {
  it("drops accents and spaces, upper case", () => {
    expect(codeToken("An Phát")).toBe("ANPHAT");
    expect(codeToken("Đông Á")).toBe("DONGA");
    expect(codeToken("minh phát")).toBe("MINHPHAT");
  });

  it("keeps digits and drops symbols", () => {
    expect(codeToken("NT-0003")).toBe("NT0003");
  });

  it("refuses an empty result", () => {
    expect(() => codeToken("  -/ ")).toThrow(CODE_MESSAGES.empty);
    expect(() => codeToken("")).toThrow(CODE_MESSAGES.empty);
  });

  it("refuses more than 20 characters", () => {
    expect(codeToken("A".repeat(20))).toHaveLength(20);
    expect(() => codeToken("A".repeat(21))).toThrow(CODE_MESSAGES.tooLong);
  });
});

describe("contract codes (0.2 #40, #52)", () => {
  const base = contractCodeBase({
    month: 11,
    year: 2026,
    companyShort: "ANPHAT",
    customerToken: "MINHPHAT",
  });

  it("builds MMYYYY/<company>-<customer>", () => {
    expect(base).toBe("112026/ANPHAT-MINHPHAT");
    expect(
      contractCodeBase({
        month: 1,
        year: 2027,
        companyShort: "ANPHAT",
        customerToken: "NT0003",
      }),
    ).toBe("012027/ANPHAT-NT0003");
  });

  it("adds -n from the second contract of the same base", () => {
    expect(contractCode(base, 1)).toBe("112026/ANPHAT-MINHPHAT");
    expect(contractCode(base, 2)).toBe("112026/ANPHAT-MINHPHAT-2");
    expect(contractCode(base, 3)).toBe("112026/ANPHAT-MINHPHAT-3");
  });

  it("numbers amendments with two digits", () => {
    expect(amendmentCode("112026/ANPHAT-MINHPHAT", 1)).toBe(
      "112026/ANPHAT-MINHPHAT/01",
    );
    expect(amendmentCode("112026/ANPHAT-MINHPHAT", 12)).toBe(
      "112026/ANPHAT-MINHPHAT/12",
    );
    expect(amendmentCode("112026/ANPHAT-MINHPHAT", 100)).toBe(
      "112026/ANPHAT-MINHPHAT/100",
    );
  });

  it("defaults the customer part to the last token, else the code", () => {
    expect(defaultCustomerToken("NT-0003", "MINHPHAT")).toBe("MINHPHAT");
    expect(defaultCustomerToken("NT-0003", null)).toBe("NT0003");
  });
});
