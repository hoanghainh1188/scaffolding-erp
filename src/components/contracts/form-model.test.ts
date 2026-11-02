import { describe, expect, it } from "vitest";

import {
  contentBody,
  EMPTY_STATE,
  kitParts,
  previewContent,
  readMoney,
  syncRentRows,
  type ItemOption,
  type KitOption,
} from "./form-model";

const item = (
  id: string,
  dailyRentalPrice: number | null,
  lostPrice: number | null = null,
): ItemOption => ({
  id,
  code: id,
  name: id,
  unit: "PIECE",
  standardWeightKg: "13.5",
  dailyRentalPrice,
  lostPrice,
  damagePrice: null,
});

const ITEMS = new Map(
  [
    item("GG-K17", 1200, 350_000),
    item("GG-CH", 300),
    item("GG-M16", 900),
    item("PK-KU", 450),
  ].map((entry) => [entry.id, entry]),
);
const BO17: KitOption = {
  id: "BO-17",
  code: "BO-17",
  name: "Bộ giàn giáo 1,7m",
  components: [
    { itemId: "GG-K17", quantity: 2 },
    { itemId: "GG-CH", quantity: 2 },
    { itemId: "GG-M16", quantity: 1 },
  ],
};
const KITS = new Map([[BO17.id, BO17]]);

describe("D5a form model", () => {
  const kits = [{ key: 1, kitId: "BO-17", quantity: "300" }];

  it("adds a row per kit part with the catalog price", () => {
    const rows = syncRentRows([], kitParts(kits, KITS), ITEMS);
    expect(rows.map((row) => [row.itemId, row.own, row.price])).toEqual([
      ["GG-K17", "0", "1200"],
      ["GG-CH", "0", "300"],
      ["GG-M16", "0", "900"],
    ]);
  });

  it("drops parts when the kit goes, keeps rows added alone", () => {
    const rows = syncRentRows(
      [
        { key: 1, itemId: "GG-K17", own: "0", price: "1200" },
        { key: 2, itemId: "PK-KU", own: "400", price: "400" },
      ],
      new Map(),
      ITEMS,
    );
    expect(rows.map((row) => row.itemId)).toEqual(["PK-KU"]);
  });

  it("shows the day's rent of D5 and both month lengths", () => {
    const rent = [
      ...syncRentRows([], kitParts(kits, KITS), ITEMS),
      { key: 9, itemId: "PK-KU", own: "400", price: "400" },
    ];
    const preview = previewContent(
      "RENTAL",
      { ...EMPTY_STATE, kits, rent },
      ITEMS,
      KITS,
    );
    expect(preview.dayRent).toBe(1_330_000);
    expect(preview.months).toEqual([
      { days: 30, amount: 39_900_000 },
      { days: 31, amount: 41_230_000 },
    ]);
    // PK-KU at 400 ₫ while the catalog says 450 ₫.
    expect(preview.offCatalog.rent).toBe(1);
  });

  it("adds a sale by kg, rounding half up", () => {
    const preview = previewContent(
      "SALE",
      {
        ...EMPTY_STATE,
        sale: [
          {
            key: 1,
            itemId: "GG-K17",
            condition: "GOOD",
            pricingUnit: "KG",
            quantity: "1250,5",
            price: "14.000",
          },
        ],
      },
      ITEMS,
      KITS,
    );
    expect(preview.saleTotal).toBe(17_507_000);
  });

  it("reads money typed with dots, refuses decimals", () => {
    expect(readMoney("1.250.000")).toBe(1_250_000);
    expect(readMoney("")).toBeNull();
    expect(readMoney("1200,5")).toBeNaN();
  });

  it("builds the body and flags a bad price on its row", () => {
    const result = contentBody(
      "RENTAL",
      {
        ...EMPTY_STATE,
        rent: [{ key: 1, itemId: "PK-KU", own: "400", price: "1200,5" }],
      },
      ITEMS,
      false,
    );
    expect(result).toEqual({
      ok: false,
      errors: { "lines.0.price": "Giá phải là số nguyên từ 0 ₫ trở lên." },
    });
  });
});
