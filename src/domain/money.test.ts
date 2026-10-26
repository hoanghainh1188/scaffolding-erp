import { describe, expect, it } from "vitest";

import { DomainValueError } from "./errors";
import { formatMoney, formatMoneyForInput, parseMoney, toMoney } from "./money";

describe("toMoney", () => {
  it("accepts whole đồng, zero and negatives", () => {
    expect(toMoney(1_250_000)).toBe(1_250_000);
    expect(toMoney(0)).toBe(0);
    expect(toMoney(-50_000)).toBe(-50_000);
  });

  it("rejects fractional amounts instead of rounding", () => {
    expect(() => toMoney(1_250_000.5)).toThrow(DomainValueError);
    expect(() => toMoney(1_250_000.5)).toThrow("Số tiền phải là số nguyên");
  });

  it("rejects amounts beyond the safe integer range", () => {
    expect(() => toMoney(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "Số tiền vượt giới hạn",
    );
    expect(() => toMoney(Number.NaN)).toThrow(DomainValueError);
  });
});

describe("formatMoney", () => {
  it("groups thousands with dots and appends ₫", () => {
    expect(formatMoney(toMoney(1_250_000))).toBe("1.250.000 ₫");
  });

  it("formats zero and negative amounts", () => {
    expect(formatMoney(toMoney(0))).toBe("0 ₫");
    expect(formatMoney(toMoney(-50_000))).toBe("-50.000 ₫");
  });
});

describe("formatMoneyForInput", () => {
  it("drops separators and the currency sign", () => {
    expect(formatMoneyForInput(toMoney(1_250_000))).toBe("1250000");
    expect(formatMoneyForInput(toMoney(-50_000))).toBe("-50000");
  });

  it("round-trips through parseMoney", () => {
    const value = toMoney(4_250_000);
    expect(parseMoney(formatMoneyForInput(value))).toBe(value);
  });
});

describe("parseMoney", () => {
  it.each(["1.250.000", "1250000", "1.250.000 ₫", " 1.250.000₫ ", "1 250 000"])(
    "reads %j as 1250000",
    (input) => {
      expect(parseMoney(input)).toBe(1_250_000);
    },
  );

  it("reads negative amounts", () => {
    expect(parseMoney("-50.000")).toBe(-50_000);
  });

  it("rejects text that is not a number", () => {
    expect(() => parseMoney("12a00")).toThrow("Số tiền không hợp lệ");
    expect(() => parseMoney("")).toThrow("Số tiền không hợp lệ");
  });

  it("rejects dots that are not thousands groups", () => {
    expect(() => parseMoney("1.25")).toThrow("Số tiền không hợp lệ");
    expect(() => parseMoney("12.50.000")).toThrow("Số tiền không hợp lệ");
  });

  it("rejects decimal amounts", () => {
    expect(() => parseMoney("1250000,5")).toThrow("Số tiền phải là số nguyên");
  });
});
