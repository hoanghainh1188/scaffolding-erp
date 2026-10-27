import { describe, expect, it } from "vitest";

import {
  ITEM_CODE_MESSAGES,
  isValidCatalogCode,
  normalizeCatalogCode,
  parseCatalogCode,
} from "./item-code";

describe("catalog codes", () => {
  it("turns gg-k17 into GG-K17", () => {
    expect(normalizeCatalogCode(" gg-k17 ")).toBe("GG-K17");
    expect(parseCatalogCode("gg-k17")).toBe("GG-K17");
  });

  it.each(["GG-K17", "BAI-01", "XUONG-01", "OT-06", "AB"])(
    "accepts %s",
    (code) => {
      expect(isValidCatalogCode(code)).toBe(true);
    },
  );

  it.each(["GG K17", "-GGK17", "GGK17-", "GG--K17", "GG_K17", "ĐK-01"])(
    "rejects %s with the format message",
    (code) => {
      expect(() => parseCatalogCode(code)).toThrow(ITEM_CODE_MESSAGES.format);
    },
  );

  it("rejects 1 and 21 characters", () => {
    expect(() => parseCatalogCode("G")).toThrow(ITEM_CODE_MESSAGES.length);
    expect(() => parseCatalogCode("A".repeat(21))).toThrow(
      ITEM_CODE_MESSAGES.length,
    );
    expect(parseCatalogCode("A".repeat(20))).toBe("A".repeat(20));
  });
});
