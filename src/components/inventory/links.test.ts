import { describe, expect, it } from "vitest";

import { stockCardHref } from "./links";

describe("stockCardHref (catalog-extensions D1)", () => {
  it("encodes +, comma, space and accents in the code", () => {
    expect(stockCardHref("KB+KU34")).toBe("/inventory/items/KB%2BKU34");
    expect(stockCardHref("NỐI 34")).toBe(
      `/inventory/items/${encodeURIComponent("NỐI 34")}`,
    );
    expect(decodeURIComponent(stockCardHref("H1,7").split("/").at(-1)!)).toBe(
      "H1,7",
    );
  });
});
