import { describe, expect, it } from "vitest";

import { KIT_MESSAGES, kitTotals, validateKitComponents } from "./kit";
import { toMoney } from "./money";
import { quantityFromNumber as q } from "./quantity";

const line = (
  itemId: string,
  quantity: number,
  overrides: Partial<Parameters<typeof validateKitComponents>[0][number]> = {},
) => ({
  itemId,
  code: itemId.toUpperCase(),
  unit: "PIECE" as const,
  status: "ACTIVE" as const,
  quantity,
  ...overrides,
});

describe("validateKitComponents", () => {
  it("accepts Bộ giàn giáo 1,7m", () => {
    expect(
      validateKitComponents([
        line("gg-k17", 2),
        line("gg-ch", 2),
        line("gg-m16", 1),
      ]),
    ).toBeNull();
  });

  it("refuses a kit of 1 piece", () => {
    expect(validateKitComponents([line("gg-k17", 1)])).toBe(
      KIT_MESSAGES.tooSmall,
    );
    expect(validateKitComponents([])).toBe(KIT_MESSAGES.tooSmall);
  });

  it("accepts 2 of the same piece on one line", () => {
    expect(validateKitComponents([line("gg-k17", 2)])).toBeNull();
  });

  it("refuses duplicate lines", () => {
    expect(validateKitComponents([line("gg-ch", 1), line("gg-ch", 1)])).toBe(
      "Mỗi vật tư chỉ một dòng trong bộ",
    );
  });

  it("refuses kg items", () => {
    expect(
      validateKitComponents([
        line("gg-k17", 2),
        line("pl-sat", 1, { unit: "KG" }),
      ]),
    ).toBe("Bộ chỉ gồm vật tư đếm được (cái, cây, bó...)");
  });

  it("refuses metre items and accepts bars (catalog-extensions D2)", () => {
    expect(
      validateKitComponents([
        line("gg-k17", 2),
        line("ong-49", 1, { unit: "METER" }),
      ]),
    ).toBe(KIT_MESSAGES.pieceOnly);
    expect(
      validateKitComponents([
        line("ong-6m", 4, { unit: "BAR" }),
        line("ku0,5", 8),
      ]),
    ).toBeNull();
  });

  it("refuses archived items by code", () => {
    expect(
      validateKitComponents([line("kk-01", 2, { status: "ARCHIVED" })]),
    ).toBe("Vật tư KK-01 đã ngừng dùng");
  });

  it("refuses a quantity of 0 or a fraction", () => {
    expect(validateKitComponents([line("a", 0), line("b", 2)])).toBe(
      KIT_MESSAGES.quantity,
    );
    expect(validateKitComponents([line("a", 1.5), line("b", 2)])).toBe(
      KIT_MESSAGES.quantity,
    );
  });
});

describe("kitTotals", () => {
  const parts = (chPrice: number | null) => [
    {
      quantity: 2,
      standardWeightKg: q(13.5, "KG"),
      dailyRentalPrice: toMoney(1200),
    },
    {
      quantity: 2,
      standardWeightKg: q(2.8, "KG"),
      dailyRentalPrice: chPrice === null ? null : toMoney(chPrice),
    },
    {
      quantity: 1,
      standardWeightKg: q(11, "KG"),
      dailyRentalPrice: toMoney(900),
    },
  ];

  it("weighs 43,6 kg and rents for 3.900 ₫ a day", () => {
    expect(kitTotals(parts(300))).toEqual({
      weight: q(43.6, "KG"),
      rentalPerDay: 3900,
    });
  });

  it("follows a part's new price: 4.000 ₫ when GG-CH costs 350 ₫", () => {
    expect(kitTotals(parts(350)).rentalPerDay).toBe(4000);
  });

  it("is not for rent when a part is not", () => {
    expect(kitTotals(parts(null)).rentalPerDay).toBeNull();
  });
});
