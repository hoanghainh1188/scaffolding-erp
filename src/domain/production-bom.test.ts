// Production BOMs (production-orders tasks 2.2; spec production-boms).
import { describe, expect, it } from "vitest";

import { toMoney } from "./money";
import {
  BOM_MESSAGES,
  bomEstimate,
  checkBom,
  isScrapItemKind,
  type BomInput,
  type BomItem,
} from "./production-bom";

const finished: BomItem = {
  itemId: "k17",
  itemCode: "GG-K17",
  unit: "PIECE",
  category: "EQUIPMENT",
  active: true,
};
const pipe = {
  itemId: "ong",
  itemCode: "VT-ONG42",
  unit: "KG" as const,
  category: "MATERIAL" as const,
  active: true,
  perUnitMilli: 9800,
};
const bom = (over: Partial<BomInput> = {}): BomInput => ({
  finished,
  laborRate: 35_000,
  materials: [pipe],
  ...over,
});

describe("checkBom (spec: định mức của một thành phẩm)", () => {
  it("accepts a valid BOM, and a labour of 0", () => {
    expect(() => checkBom(bom())).not.toThrow();
    expect(() => checkBom(bom({ laborRate: 0 }))).not.toThrow();
  });

  it.each<[string, BomInput, string]>([
    [
      "a material as finished goods",
      bom({ finished: { ...finished, category: "MATERIAL" } }),
      BOM_MESSAGES.finishedKind,
    ],
    [
      "finished goods in kg",
      bom({ finished: { ...finished, unit: "KG" } }),
      BOM_MESSAGES.finishedKind,
    ],
    ["no materials", bom({ materials: [] }), BOM_MESSAGES.noMaterials],
    [
      "equipment as a material",
      bom({ materials: [{ ...pipe, category: "EQUIPMENT" }] }),
      BOM_MESSAGES.materialKind,
    ],
    [
      "a zero quantity",
      bom({ materials: [{ ...pipe, perUnitMilli: 0 }] }),
      BOM_MESSAGES.quantity,
    ],
    [
      "the same material twice",
      bom({ materials: [pipe, pipe] }),
      BOM_MESSAGES.duplicate("VT-ONG42"),
    ],
    ["a negative labour", bom({ laborRate: -1 }), BOM_MESSAGES.labor],
    ["a fractional labour", bom({ laborRate: 1.5 }), BOM_MESSAGES.labor],
  ])("refuses %s", (_name, input, message) => {
    expect(() => checkBom(input)).toThrow(message);
  });

  it("refuses archived items", () => {
    expect(() =>
      checkBom(bom({ finished: { ...finished, active: false } })),
    ).toThrow(BOM_MESSAGES.finishedArchived("GG-K17"));
    expect(() =>
      checkBom(bom({ materials: [{ ...pipe, active: false }] })),
    ).toThrow(BOM_MESSAGES.materialArchived("VT-ONG42"));
  });
});

describe("bomEstimate (spec: giá thành dự tính)", () => {
  const price = (value: number) => toMoney(value);

  it("gives the D19 figures for the frame", () => {
    const estimate = bomEstimate(
      [
        { perUnitMilli: 9800, newAvg: price(19_500), goodAvg: null },
        { perUnitMilli: 3600, newAvg: price(19_000), goodAvg: null },
        { perUnitMilli: 120, newAvg: price(45_000), goodAvg: null },
        { perUnitMilli: 80, newAvg: price(90_000), goodAvg: null },
        { perUnitMilli: 4000, newAvg: price(2_500), goodAvg: null },
      ],
      price(35_000),
    );
    expect(estimate.lines.map((line) => line.amount)).toEqual([
      191_100, 68_400, 5_400, 7_200, 10_000,
    ]);
    expect(estimate.materials).toBe(282_100);
    expect(estimate.total).toBe(317_100);
  });

  it("marks the total unknown when a material has no price", () => {
    const estimate = bomEstimate(
      [{ perUnitMilli: 4000, newAvg: null, goodAvg: null }],
      price(35_000),
    );
    expect(estimate.lines[0]).toEqual({ unitPrice: null, amount: null });
    expect(estimate.total).toBeNull();
  });

  it("takes the Good price when New has none", () => {
    const estimate = bomEstimate(
      [{ perUnitMilli: 1000, newAvg: null, goodAvg: price(16_000) }],
      price(0),
    );
    expect(estimate.lines[0]?.unitPrice).toBe(16_000);
    expect(estimate.total).toBe(16_000);
  });
});

describe("isScrapItemKind", () => {
  it("takes only an active kg material", () => {
    const base = { unit: "KG", category: "MATERIAL", active: true } as const;
    expect(isScrapItemKind(base)).toBe(true);
    expect(isScrapItemKind({ ...base, unit: "PIECE" })).toBe(false);
    expect(isScrapItemKind({ ...base, category: "EQUIPMENT" })).toBe(false);
    expect(isScrapItemKind({ ...base, active: false })).toBe(false);
  });
});
