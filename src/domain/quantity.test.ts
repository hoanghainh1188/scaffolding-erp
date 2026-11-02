import { describe, expect, it } from "vitest";

import { DomainValueError } from "./errors";
import {
  MAX_QUANTITY_MILLI,
  QUANTITY_UNITS,
  QUANTITY_UNIT_LABELS,
  addQuantity,
  formatQuantity,
  formatByUnit,
  formatQuantityForInput,
  hasStandardWeight,
  isCountUnit,
  parseQuantity,
  quantityFromDb,
  quantityFromNumber,
  quantityToDb,
  subtractQuantity,
  sumByUnit,
  toQuantity,
} from "./quantity";

const kg = (value: number) => quantityFromNumber(value, "KG");
const pcs = (value: number) => quantityFromNumber(value, "PIECE");

describe("toQuantity", () => {
  it("stores thousandths as an integer", () => {
    expect(toQuantity(250_500, "KG")).toEqual({ unit: "KG", milli: 250_500 });
  });

  it("requires whole pieces", () => {
    expect(() => toQuantity(12_500, "PIECE")).toThrow(
      "Số lượng cái phải là số nguyên",
    );
    expect(toQuantity(12_000, "PIECE")).toEqual({
      unit: "PIECE",
      milli: 12_000,
    });
  });

  it("enforces the 99.999.999.999,999 limit", () => {
    expect(toQuantity(MAX_QUANTITY_MILLI, "KG").milli).toBe(MAX_QUANTITY_MILLI);
    expect(() => toQuantity(MAX_QUANTITY_MILLI + 1, "KG")).toThrow(
      "Số lượng vượt giới hạn",
    );
    expect(() => toQuantity(-MAX_QUANTITY_MILLI - 1, "KG")).toThrow(
      "Số lượng vượt giới hạn",
    );
  });

  it("rejects non-integer thousandths", () => {
    expect(() => toQuantity(1.5, "KG")).toThrow(DomainValueError);
  });
});

describe("quantityFromNumber", () => {
  it("converts decimals without float drift", () => {
    expect(kg(0.1).milli).toBe(100);
    expect(kg(250.5).milli).toBe(250_500);
  });

  it("rejects more than 3 decimals", () => {
    expect(() => kg(1.2345)).toThrow("Số lượng kg tối đa 3 chữ số thập phân");
  });
});

describe("parseQuantity", () => {
  it("rejects a fraction for pieces", () => {
    expect(() => parseQuantity("12,5", "PIECE")).toThrow(
      "Số lượng cái phải là số nguyên",
    );
  });

  it("never reads a dotted piece count as thousands", () => {
    expect(() => parseQuantity("1.234", "PIECE")).toThrow(
      "Số lượng cái phải là số nguyên",
    );
    expect(() => parseQuantity("1.000", "PIECE")).toThrow(
      "Số lượng cái phải là số nguyên",
    );
  });

  it("accepts zero", () => {
    expect(parseQuantity("0", "PIECE")).toEqual(pcs(0));
  });

  it.each([
    ["250,5", 250_500],
    ["250.5", 250_500],
    ["0.75", 750],
    ["0.500", 500],
    ["1,234", 1_234],
    [" 80 ", 80_000],
    ["-2,5", -2_500],
  ])("reads %j kg", (input, milli) => {
    expect(parseQuantity(input, "KG")).toEqual({ unit: "KG", milli });
  });

  it.each(["1.234", "12.500", "-1.234"])(
    "treats %j kg as ambiguous",
    (input) => {
      expect(() => parseQuantity(input, "KG")).toThrow(
        "Chưa rõ số này. Gõ 1234 hoặc 1,234",
      );
    },
  );

  it("rejects several dots", () => {
    expect(() => parseQuantity("1.234.567", "KG")).toThrow(
      "Số lượng không hợp lệ. Không dùng dấu chấm ngăn cách hàng nghìn",
    );
  });

  it("rejects more than 3 decimals for kg", () => {
    expect(() => parseQuantity("1,2345", "KG")).toThrow(
      "Số lượng kg tối đa 3 chữ số thập phân",
    );
  });

  it.each(["", "abc", "1,2,3", "1.234,5", "12a", "+3"])(
    "rejects %j",
    (input) => {
      expect(() => parseQuantity(input, "KG")).toThrow(DomainValueError);
    },
  );

  it("enforces the upper limit", () => {
    expect(parseQuantity("99999999999,999", "KG").milli).toBe(
      MAX_QUANTITY_MILLI,
    );
    expect(() => parseQuantity("100000000000", "KG")).toThrow(
      "Số lượng vượt giới hạn",
    );
  });
});

describe("add / subtract", () => {
  it("adds decimals exactly", () => {
    expect(addQuantity(kg(0.1), kg(0.2))).toEqual(kg(0.3));
  });

  it("subtracts", () => {
    expect(subtractQuantity(pcs(100), pcs(98))).toEqual(pcs(2));
  });

  it("refuses to mix units", () => {
    expect(() => addQuantity(pcs(10), kg(2.5))).toThrow(
      "Không tính được hai số lượng khác đơn vị",
    );
    expect(() => subtractQuantity(pcs(10), kg(2.5))).toThrow(DomainValueError);
  });

  it("checks the limit on the result", () => {
    const max = toQuantity(MAX_QUANTITY_MILLI, "KG");
    expect(() => addQuantity(max, kg(0.001))).toThrow("Số lượng vượt giới hạn");
  });
});

describe("formatQuantity", () => {
  it("uses dots for thousands, a comma for decimals, no trailing zeros", () => {
    expect(formatQuantity(kg(1234.5))).toBe("1.234,5");
    expect(formatQuantity(pcs(80))).toBe("80");
    expect(formatQuantity(kg(0.25))).toBe("0,25");
    expect(formatQuantity(kg(-1234.567))).toBe("-1.234,567");
    expect(formatQuantity(pcs(1500))).toBe("1.500");
  });
});

describe("formatQuantityForInput", () => {
  it("drops thousands separators and keeps a decimal comma", () => {
    expect(formatQuantityForInput(kg(1234.5))).toBe("1234,5");
    expect(formatQuantityForInput(pcs(0))).toBe("0");
    expect(formatQuantityForInput(pcs(1500))).toBe("1500");
  });

  it.each([1234.5, 1.234, 0.5, 12.5, 99_999_999_999.999])(
    "round-trips %d kg",
    (value) => {
      const q = kg(value);
      expect(parseQuantity(formatQuantityForInput(q), "KG")).toEqual(q);
    },
  );
});

describe("database numeric(14,3)", () => {
  it("reads numeric strings without parseFloat", () => {
    expect(quantityFromDb("250.500", "KG")).toEqual(kg(250.5));
    expect(quantityFromDb("1234.000", "PIECE")).toEqual(pcs(1234));
    expect(quantityFromDb("-0.001", "KG").milli).toBe(-1);
    expect(quantityFromDb("99999999999.999", "KG").milli).toBe(
      MAX_QUANTITY_MILLI,
    );
  });

  it("rejects malformed numeric strings", () => {
    expect(() => quantityFromDb("1,5", "KG")).toThrow(DomainValueError);
    expect(() => quantityFromDb("1.5000", "KG")).toThrow(DomainValueError);
  });

  it("writes 3 decimals", () => {
    expect(quantityToDb(kg(250.5))).toBe("250.500");
    expect(quantityToDb(pcs(0))).toBe("0.000");
    expect(quantityToDb(kg(-0.001))).toBe("-0.001");
  });
});

describe("units (catalog-extensions D2)", () => {
  it("has 7 count units and 2 measure units with labels", () => {
    expect(QUANTITY_UNITS).toHaveLength(9);
    expect(QUANTITY_UNITS.filter(isCountUnit)).toEqual([
      "PIECE",
      "BAR",
      "BUNDLE",
      "BASKET",
      "ROLL",
      "BOX",
      "CARTON",
    ]);
    expect(QUANTITY_UNIT_LABELS.BUNDLE).toBe("bó");
    expect(QUANTITY_UNIT_LABELS.METER).toBe("m");
  });

  it("gives a standard weight to every unit but kg", () => {
    expect(QUANTITY_UNITS.filter((unit) => !hasStandardWeight(unit))).toEqual([
      "KG",
    ]);
  });

  it("refuses 2,5 bó", () => {
    expect(() => parseQuantity("2,5", "BUNDLE")).toThrow(
      "Số lượng bó phải là số nguyên",
    );
    expect(() => quantityFromNumber(2.5, "BUNDLE")).toThrow(
      "Số lượng bó phải là số nguyên",
    );
  });

  it("accepts 12,345 m", () => {
    expect(parseQuantity("12,345", "METER")).toEqual({
      unit: "METER",
      milli: 12345,
    });
  });
});

describe("totals per unit (0.2 #47)", () => {
  it("sums cái and bó apart, in unit order", () => {
    const totals = sumByUnit([
      { unit: "BUNDLE", milli: 4000 },
      { unit: "PIECE", milli: 30_000 },
      { unit: "PIECE", milli: 10_000 },
      { unit: "BUNDLE", milli: 5000 },
    ]);
    expect(totals).toEqual([
      { unit: "PIECE", milli: 40_000 },
      { unit: "BUNDLE", milli: 9000 },
    ]);
    expect(formatByUnit(totals)).toBe("40 cái, 9 bó");
  });

  it("shows 0 cái when empty and keeps zero units it was given", () => {
    expect(formatByUnit([])).toBe("0 cái");
    expect(formatByUnit(sumByUnit([{ unit: "BAR", milli: 0 }]))).toBe("0 cây");
  });
});
