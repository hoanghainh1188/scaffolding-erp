import { describe, expect, it } from "vitest";

import {
  allocate,
  landedUnitCost,
  LANDED_COST_MESSAGES,
  lineWeightKgMilli,
  splitLotByCondition,
  type AllocationLine,
} from "./landed-cost";
import { toMoney, type Money } from "./money";

const m = toMoney;

/** The four lines of design D3 (drawing D3, expected numbers). */
const D3: AllocationLine[] = [
  // Khung 1,7m: 200 cái × 185.000, 13,5 kg
  { amount: m(37_000_000), weightKgMilli: 2_700_000, quantityMilli: 200_000 },
  // Chéo: 400 cái × 32.000, 2,8 kg
  { amount: m(12_800_000), weightKgMilli: 1_120_000, quantityMilli: 400_000 },
  // Mâm 1,6m: 150 cái × 145.000, 11 kg
  { amount: m(21_750_000), weightKgMilli: 1_650_000, quantityMilli: 150_000 },
  // Phế liệu sắt lẫn: 1.250,5 kg × 7.500
  { amount: m(9_378_750), weightKgMilli: 1_250_500, quantityMilli: 1_250_500 },
];
const COSTS = m(4_880_000);

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

describe("allocate", () => {
  it("splits the D3 costs by value as in design D3", () => {
    const parts = allocate(COSTS, D3, "VALUE");
    expect(parts).toEqual([2_231_098, 771_840, 1_311_524, 565_538]);
    expect(sum(parts)).toBe(4_880_000);
    expect(
      D3.map((line, index) =>
        landedUnitCost(line.amount, parts[index] as Money, line.quantityMilli),
      ),
    ).toEqual([196_155, 33_930, 153_743, 7_952]);
  });

  it("splits the D3 costs by weight as in design D3", () => {
    const parts = allocate(COSTS, D3, "WEIGHT");
    expect(parts).toEqual([1_960_568, 813_273, 1_198_125, 908_034]);
    expect(sum(parts)).toBe(4_880_000);
    expect(
      D3.map((line, index) =>
        landedUnitCost(line.amount, parts[index] as Money, line.quantityMilli),
      ),
    ).toEqual([194_803, 34_033, 152_988, 8_226]);
  });

  it("gives the spare đồng to the largest remainders, the earlier on a tie", () => {
    const one = { amount: m(0), weightKgMilli: 0, quantityMilli: 1000 };
    expect(allocate(m(100), [one, one, one], "QUANTITY")).toEqual([34, 33, 33]);
    expect(allocate(m(2), [one, one, one], "QUANTITY")).toEqual([1, 1, 0]);
  });

  it("gives nothing to a line with no quantity", () => {
    const parts = allocate(
      m(500_000),
      [
        D3[0] as AllocationLine,
        { amount: m(0), weightKgMilli: 0, quantityMilli: 0 },
        D3[1] as AllocationLine,
      ],
      "VALUE",
    );
    expect(parts[1]).toBe(0);
    expect(sum(parts)).toBe(500_000);
  });

  it("gives zeros when there is no cost", () => {
    expect(allocate(m(0), D3, "VALUE")).toEqual([0, 0, 0, 0]);
    expect(allocate(m(0), [], "WEIGHT")).toEqual([]);
  });

  it("refuses a value split when the goods are free", () => {
    const free = { amount: m(0), weightKgMilli: 2_800, quantityMilli: 1000 };
    expect(() => allocate(m(300_000), [free], "VALUE")).toThrow(
      LANDED_COST_MESSAGES.zeroValue,
    );
    expect(allocate(m(300_000), [free], "WEIGHT")).toEqual([300_000]);
  });

  it("refuses to split costs over no goods", () => {
    expect(() => allocate(m(300_000), [], "VALUE")).toThrow(
      LANDED_COST_MESSAGES.noGoods,
    );
    expect(() =>
      allocate(
        m(300_000),
        [{ amount: m(0), weightKgMilli: 0, quantityMilli: 0 }],
        "WEIGHT",
      ),
    ).toThrow(LANDED_COST_MESSAGES.noGoods);
  });

  it("does not overflow on large numbers", () => {
    const parts = allocate(
      m(999_999_999),
      [
        { amount: m(9_000_000_000), weightKgMilli: 1, quantityMilli: 1000 },
        { amount: m(1), weightKgMilli: 1, quantityMilli: 1000 },
      ],
      "VALUE",
    );
    expect(sum(parts)).toBe(999_999_999);
    expect(parts[1]).toBe(0);
  });

  it("rejects negative input as a programming error", () => {
    expect(() => allocate(m(-1), D3, "VALUE")).toThrow(RangeError);
  });

  it("always sums to the total and stays within 1 ₫ of the exact share", () => {
    let seed = 7;
    const random = (max: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % max;
    };
    for (let round = 0; round < 500; round += 1) {
      const lines = Array.from({ length: 1 + random(8) }, () => ({
        amount: m(1 + random(50_000_000)),
        weightKgMilli: 1 + random(5_000_000),
        quantityMilli: 1000 * (1 + random(500)),
      }));
      const total = m(random(20_000_000));
      for (const basis of ["VALUE", "WEIGHT", "QUANTITY"] as const) {
        const parts = allocate(total, lines, basis);
        expect(sum(parts)).toBe(total);
        const weights = lines.map((line) =>
          basis === "VALUE"
            ? line.amount
            : basis === "WEIGHT"
              ? line.weightKgMilli
              : line.quantityMilli,
        );
        const all = sum(weights);
        parts.forEach((part, index) => {
          const exact = (total * (weights[index] ?? 0)) / all;
          expect(Math.abs(part - exact)).toBeLessThan(1 + 1e-6);
        });
      }
    }
  });
});

describe("lineWeightKgMilli", () => {
  it("weighs pieces by the standard weight and kg as they are", () => {
    expect(lineWeightKgMilli("PIECE", 200_000, "13.500")).toBe(2_700_000);
    expect(lineWeightKgMilli("KG", 1_250_500, null)).toBe(1_250_500);
    expect(lineWeightKgMilli("KG", 2_000_000, "13.500")).toBe(2_000_000);
    expect(lineWeightKgMilli("PIECE", 1000, null)).toBe(0);
  });

  it("weighs metres and bundles by their standard weight (catalog-extensions D2)", () => {
    // ONG-49: 120,5 m × 3,56 kg/m = 428,98 kg
    expect(lineWeightKgMilli("METER", 120_500, "3.560")).toBe(428_980);
    // TY-REN: 40 bó × 25 kg/bó = 1.000 kg
    expect(lineWeightKgMilli("BUNDLE", 40_000, "25.000")).toBe(1_000_000);
  });
});

describe("allocate with metres", () => {
  it("splits costs by kg for a METER item like any weighted line", () => {
    const lines: AllocationLine[] = [
      // ONG-49: 500 m × 60.000, 3,56 kg/m = 1.780 kg
      {
        amount: m(30_000_000),
        weightKgMilli: lineWeightKgMilli("METER", 500_000, "3.560"),
        quantityMilli: 500_000,
      },
      // TY-REN: 40 bó × 400.000, 25 kg/bó = 1.000 kg
      {
        amount: m(16_000_000),
        weightKgMilli: lineWeightKgMilli("BUNDLE", 40_000, "25.000"),
        quantityMilli: 40_000,
      },
      // ONG-49 bought by kg: 220 kg
      {
        amount: m(3_300_000),
        weightKgMilli: lineWeightKgMilli("KG", 220_000, "3.560"),
        quantityMilli: 220_000,
      },
    ];
    const parts = allocate(m(3_000_000), lines, "WEIGHT");
    // 3.000.000 × 1780/3000, × 1000/3000, × 220/3000
    expect(parts).toEqual([1_780_000, 1_000_000, 220_000]);
    expect(landedUnitCost(lines[0]!.amount, parts[0] as Money, 500_000)).toBe(
      63_560,
    );
  });

  it("prices metre scrap in a lot by its kg", () => {
    expect(
      splitLotByCondition({
        total: m(10_000_000),
        unit: "METER",
        standardWeightKg: "3.560",
        goodMilli: 80_000,
        repairMilli: 20_000,
        scrapMilli: 10_500,
        scrapPricePerKg: m(7_500),
      }),
    ).toEqual({
      // 10,5 m × 3,56 = 37,38 kg × 7.500 = 280.350
      SCRAP: 280_350,
      GOOD: 7_775_720,
      NEEDS_REPAIR: 1_943_930,
    });
  });
});

describe("splitLotByCondition", () => {
  const frames = {
    unit: "PIECE" as const,
    standardWeightKg: "13.500",
    scrapPricePerKg: m(7_500),
  };

  it("prices scrap at the scrap price and shares the rest by count (design D5)", () => {
    expect(
      splitLotByCondition({
        ...frames,
        total: m(39_231_098),
        goodMilli: 150_000,
        repairMilli: 38_000,
        scrapMilli: 12_000,
      }),
    ).toEqual({ GOOD: 30_331_993, NEEDS_REPAIR: 7_684_105, SCRAP: 1_215_000 });
  });

  it("gives scrap no more than the line is worth", () => {
    expect(
      splitLotByCondition({
        ...frames,
        total: m(800_000),
        goodMilli: 2_000,
        repairMilli: 0,
        scrapMilli: 8_000,
      }),
    ).toEqual({ GOOD: 0, NEEDS_REPAIR: 0, SCRAP: 800_000 });
  });

  it("gives an all-scrap lot the whole line", () => {
    expect(
      splitLotByCondition({
        ...frames,
        total: m(2_000_000),
        goodMilli: 0,
        repairMilli: 0,
        scrapMilli: 12_000,
      }),
    ).toEqual({ GOOD: 0, NEEDS_REPAIR: 0, SCRAP: 2_000_000 });
  });

  it("needs no scrap price when there is no scrap", () => {
    expect(
      splitLotByCondition({
        ...frames,
        scrapPricePerKg: null,
        total: m(39_231_098),
        goodMilli: 200_000,
        repairMilli: 0,
        scrapMilli: 0,
      }),
    ).toEqual({ GOOD: 39_231_098, NEEDS_REPAIR: 0, SCRAP: 0 });
  });

  it("rounds the scrap value half up", () => {
    const split = splitLotByCondition({
      ...frames,
      scrapPricePerKg: m(7_333),
      total: m(500_000),
      goodMilli: 2_000,
      repairMilli: 0,
      scrapMilli: 1_000,
    });
    expect(split.SCRAP).toBe(98_996);
    expect(split.GOOD).toBe(401_004);
  });

  it("asks for the scrap price when scrap shares a lot", () => {
    expect(() =>
      splitLotByCondition({
        ...frames,
        scrapPricePerKg: null,
        total: m(39_231_098),
        goodMilli: 150_000,
        repairMilli: 38_000,
        scrapMilli: 12_000,
      }),
    ).toThrow(LANDED_COST_MESSAGES.noScrapPrice);
  });

  it("refuses to price scrap of a piece item without a standard weight", () => {
    expect(() =>
      splitLotByCondition({
        ...frames,
        standardWeightKg: null,
        total: m(1_000_000),
        goodMilli: 10_000,
        repairMilli: 0,
        scrapMilli: 5_000,
      }),
    ).toThrow(LANDED_COST_MESSAGES.noWeight);
  });

  it("takes the kg themselves for an item counted in kg", () => {
    expect(
      splitLotByCondition({
        total: m(1_000_000),
        unit: "KG",
        standardWeightKg: null,
        goodMilli: 100_000,
        repairMilli: 0,
        scrapMilli: 50_000,
        scrapPricePerKg: m(7_500),
      }),
    ).toEqual({ GOOD: 625_000, NEEDS_REPAIR: 0, SCRAP: 375_000 });
  });

  it("refuses a value with nothing received", () => {
    expect(() =>
      splitLotByCondition({
        ...frames,
        total: m(1),
        goodMilli: 0,
        repairMilli: 0,
        scrapMilli: 0,
      }),
    ).toThrow(LANDED_COST_MESSAGES.noGoods);
  });
});
