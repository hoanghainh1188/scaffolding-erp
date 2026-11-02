import { describe, expect, it } from "vitest";

import {
  checkPrice,
  checkSaleLine,
  explodeKits,
  formatVatRate,
  LINE_MESSAGES,
  offCatalogCounts,
  saleLineAmount,
  vatRate,
} from "./contract-lines";
import { toMoney } from "./money";

const BO17 = {
  kitId: "BO-17",
  quantity: 300,
  components: [
    { itemId: "H1,7", quantity: 2 },
    { itemId: "CHEO1,7", quantity: 2 },
    { itemId: "MAM1,6", quantity: 1 },
  ],
};

describe("explodeKits", () => {
  it("splits 300 kits into parts", () => {
    expect(
      explodeKits([BO17], []).map((line) => [line.itemId, line.quantityMilli]),
    ).toEqual([
      ["H1,7", 600_000],
      ["CHEO1,7", 600_000],
      ["MAM1,6", 300_000],
    ]);
  });

  it("merges a kit part with the same item added alone", () => {
    const mam = explodeKits(
      [BO17],
      [{ itemId: "MAM1,6", ownMilli: 100_000 }],
    ).filter((line) => line.itemId === "MAM1,6");
    expect(mam).toEqual([
      {
        itemId: "MAM1,6",
        ownMilli: 100_000,
        kitMilli: 300_000,
        quantityMilli: 400_000,
      },
    ]);
  });

  it("refuses a line of 0 pieces", () => {
    expect(() => explodeKits([], [{ itemId: "KU0,5", ownMilli: 0 }])).toThrow(
      "Số lượng phải lớn hơn 0. Bạn bỏ dòng nếu không thuê mã này.",
    );
  });

  it("refuses a kit count that is not a whole number", () => {
    expect(() => explodeKits([{ ...BO17, quantity: 1.5 }], [])).toThrow(
      LINE_MESSAGES.kitQuantity,
    );
  });

  it("refuses the same kit twice", () => {
    expect(() => explodeKits([BO17, BO17], [])).toThrow(LINE_MESSAGES.kitTwice);
  });
});

describe("sale lines", () => {
  const frame = {
    itemCode: "H1,7",
    itemByKg: false,
    hasStandardWeight: true,
  };

  it("sells a piece item by kg", () => {
    expect(
      checkSaleLine({ ...frame, condition: "GOOD", pricingUnit: "KG" }),
    ).toBe("GOOD");
    expect(saleLineAmount(1_250_500, toMoney(14_000))).toBe(17_507_000);
  });

  it("sells by the piece", () => {
    expect(saleLineAmount(200_000, toMoney(320_000))).toBe(64_000_000);
  });

  it("rounds half up", () => {
    // 0,5 kg × 1 ₫
    expect(saleLineAmount(500, toMoney(1))).toBe(1);
  });

  it("refuses scrap by the piece", () => {
    expect(() =>
      checkSaleLine({ ...frame, condition: "SCRAP", pricingUnit: "ITEM" }),
    ).toThrow("Phế liệu chỉ bán theo kg.");
  });

  it("refuses kg for an item without standard weight", () => {
    expect(() =>
      checkSaleLine({
        itemCode: "ONG-49",
        itemByKg: false,
        hasStandardWeight: false,
        condition: "NEW",
        pricingUnit: "KG",
      }),
    ).toThrow("Mã ONG-49 chưa có trọng lượng chuẩn nên chưa bán theo kg được.");
  });

  it("refuses a missing or needs-repair condition", () => {
    expect(() =>
      checkSaleLine({ ...frame, condition: null, pricingUnit: "ITEM" }),
    ).toThrow(LINE_MESSAGES.condition);
    expect(() =>
      checkSaleLine({
        ...frame,
        condition: "NEEDS_REPAIR",
        pricingUnit: "ITEM",
      }),
    ).toThrow(LINE_MESSAGES.condition);
  });

  it("refuses a decimal or negative price", () => {
    expect(() => checkPrice(1200.5)).toThrow(LINE_MESSAGES.price);
    expect(() => checkPrice(-1)).toThrow(LINE_MESSAGES.price);
    expect(checkPrice(0)).toBe(0);
    expect(checkPrice(null)).toBeNull();
  });
});

describe("off-catalog marks", () => {
  it("counts prices that differ from the value saved with them", () => {
    expect(
      offCatalogCounts(
        [
          { price: 400, catalogPrice: 450 },
          { price: 1200, catalogPrice: 1200 },
        ],
        [
          {
            lostPrice: 500_000,
            damagePrice: 50_000,
            catalogLostPrice: 450_000,
            catalogDamagePrice: 50_000,
          },
        ],
      ),
    ).toEqual({ rent: 1, compensation: 1 });
  });

  it("does not mark a line when the catalog changed later", () => {
    // Saved 1.200 with catalog 1.200; the catalog moving to 1.300 is not
    // part of what was saved.
    expect(
      offCatalogCounts([{ price: 1200, catalogPrice: 1200 }], []).rent,
    ).toBe(0);
  });

  it("does not mark a price typed where the catalog had none", () => {
    expect(
      offCatalogCounts([{ price: 400, catalogPrice: null }], []).rent,
    ).toBe(0);
  });
});

describe("VAT rate", () => {
  it("stores 8 % as 8.00", () => {
    expect(vatRate(true, "8")).toBe("8.00");
    expect(vatRate(true, "8,5")).toBe("8.50");
    expect(formatVatRate("8.00")).toBe("8 %");
    expect(formatVatRate("8.50")).toBe("8,5 %");
  });

  it("asks for a rate when VAT is on", () => {
    expect(() => vatRate(true, "")).toThrow("Bạn nhập thuế suất VAT.");
  });

  it("refuses 0, more than 20 and three decimals", () => {
    expect(() => vatRate(true, "0")).toThrow(LINE_MESSAGES.vatRange);
    expect(() => vatRate(true, "21")).toThrow(LINE_MESSAGES.vatRange);
    expect(() => vatRate(true, "8.125")).toThrow(LINE_MESSAGES.vatRange);
    expect(vatRate(true, "20")).toBe("20.00");
  });

  it("stores no rate without VAT", () => {
    expect(vatRate(false, "8")).toBeNull();
  });
});
