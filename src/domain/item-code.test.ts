import { describe, expect, it } from "vitest";

import {
  ITEM_CODE_MESSAGES,
  PLACE_CODE_MESSAGES,
  isValidItemCode,
  itemCodeKey,
  normalizeItemCode,
  parseItemCode,
  parsePlaceCode,
} from "./item-code";

describe("item codes (catalog-extensions D1)", () => {
  it("turns gg-k17 into GG-K17", () => {
    expect(normalizeItemCode(" gg-k17 ")).toBe("GG-K17");
    expect(parseItemCode("gg-k17")).toBe("GG-K17");
  });

  it.each([
    ["h1,7", "H1,7"],
    ["KU0,5", "KU0,5"],
    ["X5*10*3", "X5*10*3"],
    ["KB+KU34", "KB+KU34"],
    ["nối  34", "NỐI 34"],
    ["h1,7kđ", "H1,7KĐ"],
  ])("accepts the real code %j as %j", (input, code) => {
    expect(parseItemCode(input)).toBe(code);
  });

  it.each([",H17", "H1,,7", "H1/7", "GG-K17-", "GG_K17", "H1, 7"])(
    "rejects %j with the format message",
    (code) => {
      expect(() => parseItemCode(code)).toThrow(ITEM_CODE_MESSAGES.format);
    },
  );

  it("rejects 1 and 31 characters", () => {
    expect(() => parseItemCode("G")).toThrow(ITEM_CODE_MESSAGES.length);
    expect(() => parseItemCode("A".repeat(31))).toThrow(
      "Mã dài từ 2 đến 30 ký tự",
    );
    expect(parseItemCode("A".repeat(30))).toBe("A".repeat(30));
    expect(isValidItemCode("Ố".repeat(30))).toBe(true);
  });

  it("gives codes that differ only by accents or spaces the same key", () => {
    expect(itemCodeKey("NỐI 34")).toBe("noi34");
    expect(itemCodeKey("NOI34")).toBe("noi34");
    expect(itemCodeKey("H1,7KĐ")).toBe("h1,7kd");
    expect(itemCodeKey("GG-K17")).toBe("gg-k17");
  });

  it("keeps joiners in the key: H1,7 and H17 differ", () => {
    expect(itemCodeKey("H1,7")).not.toBe(itemCodeKey("H17"));
  });
});

describe("place codes", () => {
  it("keeps the strict rule for yards and workshops", () => {
    expect(parsePlaceCode("bai-01")).toBe("BAI-01");
    expect(() => parsePlaceCode("BÃI 01")).toThrow(PLACE_CODE_MESSAGES.format);
    expect(() => parsePlaceCode("A".repeat(21))).toThrow(
      PLACE_CODE_MESSAGES.length,
    );
  });
});
