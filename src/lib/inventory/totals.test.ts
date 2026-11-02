import { describe, expect, it } from "vitest";

import { describeStock, isEmpty } from "./totals";

describe("describeStock", () => {
  it("keeps the old wording for pieces and kg", () => {
    expect(describeStock({ PIECE: 1_840_000 })).toBe("1.840 cái");
    expect(describeStock({ KG: 12_850_500 })).toBe("12.850,5 kg");
    expect(describeStock({ PIECE: 60_000, KG: 12_500 })).toBe(
      "60 cái và 12,5 kg",
    );
  });

  it("never adds metres or bundles to pieces", () => {
    expect(describeStock({ PIECE: 60_000, BUNDLE: 5_000, METER: 12_000 })).toBe(
      "60 cái, 5 bó và 12 m",
    );
  });

  it("is empty only when every unit is zero", () => {
    expect(isEmpty({})).toBe(true);
    expect(isEmpty({ PIECE: 0, KG: 0 })).toBe(true);
    expect(isEmpty({ METER: 500 })).toBe(false);
  });
});
