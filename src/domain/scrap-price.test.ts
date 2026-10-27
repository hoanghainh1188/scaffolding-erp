import { describe, expect, it } from "vitest";

import { checkScrapNote, checkScrapPrice } from "./scrap-price";

describe("checkScrapPrice", () => {
  it("takes a whole price above 0", () => {
    expect(checkScrapPrice(7_500)).toBe(7_500);
  });

  it.each([0, -1, 7_500.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2])(
    "refuses %s",
    (value) => {
      expect(() => checkScrapPrice(value)).toThrow(
        "Giá sắt vụn phải là số nguyên lớn hơn 0",
      );
    },
  );
});

describe("checkScrapNote", () => {
  it("trims, drops an empty note and refuses a long one", () => {
    expect(checkScrapNote("  Giá vựa Phúc Lâm ")).toBe("Giá vựa Phúc Lâm");
    expect(checkScrapNote("  ")).toBeNull();
    expect(checkScrapNote(undefined)).toBeNull();
    expect(() => checkScrapNote("x".repeat(201))).toThrow(
      "Ghi chú dài tối đa 200 ký tự",
    );
  });
});
