import { dict } from "@/locales";
import { describe, expect, it } from "vitest";

import { unitCostOf } from "./average-cost";
import type { BusinessDate } from "./business-date";
import { toMoney, type Money } from "./money";
import { unconfirmedAnomalies } from "./receipt-anomalies";
import {
  REPAIR_MESSAGES,
  RepairFieldError,
  assertRepairDate,
  checkRepairLines,
  REPAIRABLE_UNITS,
  costRepairLine,
  goodUnitCost,
  isRepairableUnit,
  perRepairedPiece,
  previewAverage,
  repairAnomalies,
  repairPostedNote,
  repairPostingLines,
  repairTotals,
  scrapKgMilli,
  scrapValue,
  sumMismatchText,
  type RepairLineInput,
} from "./repair-order";

const K = 1000;
const m = toMoney;

function line(
  itemCode: string,
  taken: number,
  good: number,
  scrap: number,
  repairCost = 0,
  extra: Partial<RepairLineInput> = {},
): RepairLineInput {
  return {
    itemId: itemCode,
    itemCode,
    unit: "PIECE",
    takenMilli: taken * K,
    goodMilli: good * K,
    scrapMilli: scrap * K,
    repairCost,
    ...extra,
  };
}

function fieldError(run: () => void): { message: string; field: string } {
  try {
    run();
  } catch (error) {
    if (error instanceof RepairFieldError) {
      return { message: error.message, field: error.field };
    }
    throw error;
  }
  throw new Error("no error");
}

describe("checkRepairLines", () => {
  it.each([
    ["40 = 36 + 4", line("GG-K17", 40, 36, 4, 1_980_000)],
    ["5 = 0 + 5", line("GG-M16", 5, 0, 5)],
    ["20 = 20 + 0", line("GG-CH", 20, 20, 0, 240_000)],
  ])("accepts %s", (_name, valid) => {
    expect(() => checkRepairLines([valid])).not.toThrow();
  });

  it("needs repaired + scrap to equal the pieces taken", () => {
    expect(
      fieldError(() => checkRepairLines([line("GG-K17", 40, 30, 4)])),
    ).toEqual({
      message: REPAIR_MESSAGES.sumMismatch("GG-K17", 34 * K, 40 * K),
      field: "lines.0.quantityGood",
    });
    expect(sumMismatchText(34 * K, 40 * K)).toBe(
      dict.repairs.messages.sumMismatch("34", "40"),
    );
  });

  it("refuses nothing taken, half pieces and negatives", () => {
    expect(
      fieldError(() => checkRepairLines([line("GG-CH", 0, 0, 0)])),
    ).toEqual({
      message: REPAIR_MESSAGES.takenZero("GG-CH"),
      field: "lines.0.quantityTaken",
    });
    expect(
      fieldError(() =>
        checkRepairLines([line("GG-CH", 0, 0, 0, 0, { takenMilli: 20_500 })]),
      ),
    ).toEqual({
      message: REPAIR_MESSAGES.wholePieces("GG-CH"),
      field: "lines.0.quantityTaken",
    });
    expect(
      fieldError(() => checkRepairLines([line("GG-K17", 40, -1, 41)])).field,
    ).toBe("lines.0.quantityGood");
  });

  it("refuses kg items, the same item twice and an empty slip", () => {
    expect(
      fieldError(() =>
        checkRepairLines([line("PL-SAT", 10, 10, 0, 0, { unit: "KG" })]),
      ).message,
    ).toBe(REPAIR_MESSAGES.kgItem("PL-SAT"));
    expect(
      fieldError(() =>
        checkRepairLines([line("GG-K17", 40, 36, 4), line("GG-K17", 1, 1, 0)]),
      ),
    ).toEqual({
      message: REPAIR_MESSAGES.duplicate("GG-K17"),
      field: "lines.1.itemId",
    });
    expect(fieldError(() => checkRepairLines([])).message).toBe(
      REPAIR_MESSAGES.noLines,
    );
  });

  it("repairs whole bundles and bars like pieces", () => {
    expect(() =>
      checkRepairLines([
        line("TC-BO", 10, 8, 2, 0, { unit: "BUNDLE" }),
        line("CAY-3M", 5, 5, 0, 0, { unit: "BAR" }),
      ]),
    ).not.toThrow();
    expect(
      fieldError(() =>
        checkRepairLines([
          line("TC-BO", 0, 0, 0, 0, { unit: "BUNDLE", takenMilli: 2_500 }),
        ]),
      ),
    ).toEqual({
      message: "TC-BO quản lý theo bó, số lượng phải là số nguyên",
      field: "lines.0.quantityTaken",
    });
    expect(REPAIRABLE_UNITS).toEqual([
      "PIECE",
      "BAR",
      "BUNDLE",
      "BASKET",
      "ROLL",
      "BOX",
      "CARTON",
    ]);
  });

  it("keeps metre items out of repairs with a clear message", () => {
    expect(isRepairableUnit("METER")).toBe(false);
    expect(isRepairableUnit("LITER")).toBe(false);
    expect(
      fieldError(() =>
        checkRepairLines([line("ONG-49", 10, 10, 0, 0, { unit: "METER" })]),
      ),
    ).toEqual({
      message: REPAIR_MESSAGES.measureItem("ONG-49", "m"),
      field: "lines.0.itemId",
    });
    expect(REPAIR_MESSAGES.measureItem("ONG-49", "m")).toBe(
      "Mã hàng ONG-49 tính theo m, chưa áp dụng quy trình sửa chữa (chỉ sửa mã tính theo đơn vị đếm)",
    );
  });

  it("weighs bundle scrap by its kg per bundle", () => {
    expect(scrapKgMilli(2 * K, "25.000")).toBe(50 * K);
  });

  it("refuses a negative or fractional cost and a cost with nothing repaired", () => {
    for (const cost of [-1_000, 1_000.5]) {
      expect(
        fieldError(() => checkRepairLines([line("GG-CH", 20, 20, 0, cost)])),
      ).toEqual({
        message: REPAIR_MESSAGES.cost,
        field: "lines.0.repairCost",
      });
    }
    expect(
      fieldError(() => checkRepairLines([line("GG-M16", 5, 0, 5, 300_000)]))
        .message,
    ).toBe(REPAIR_MESSAGES.costWithoutGood("GG-M16"));
  });

  it("adds the slip totals", () => {
    expect(
      repairTotals([
        line("GG-K17", 40, 36, 4, 1_980_000),
        line("GG-CH", 20, 20, 0, 240_000),
      ]),
    ).toEqual({
      cost: 2_220_000,
      good: [{ unit: "PIECE", milli: 56 * K }],
      scrap: [{ unit: "PIECE", milli: 4 * K }],
    });
  });

  it("keeps cái and bó apart (0.2 #47)", () => {
    expect(
      repairTotals([
        line("GG-K17", 40, 36, 4, 1_980_000),
        line("TY-REN", 10, 9, 1, 90_000, { unit: "BUNDLE" }),
      ]),
    ).toEqual({
      cost: 2_070_000,
      good: [
        { unit: "PIECE", milli: 36 * K },
        { unit: "BUNDLE", milli: 9 * K },
      ],
      scrap: [
        { unit: "PIECE", milli: 4 * K },
        { unit: "BUNDLE", milli: 1 * K },
      ],
    });
  });
});

describe("assertRepairDate", () => {
  const today = "2026-10-28" as BusinessDate;

  it("takes any day up to today", () => {
    expect(() =>
      assertRepairDate("2026-10-25" as BusinessDate, today),
    ).not.toThrow();
    expect(() => assertRepairDate(today, today)).not.toThrow();
  });

  it("refuses tomorrow", () => {
    expect(
      fieldError(() => assertRepairDate("2026-10-29" as BusinessDate, today)),
    ).toEqual({ message: REPAIR_MESSAGES.futureDate, field: "repairDate" });
  });
});

describe("scrapValue and damage", () => {
  const scrap = (
    itemCode: string,
    pieces: number,
    weight: string | null,
    B: number,
    price: number | null = 7_500,
  ) =>
    scrapValue({
      itemCode,
      scrapMilli: pieces * K,
      standardWeightKg: weight,
      scrapPricePerKg: price === null ? null : m(price),
      needsRepairAvg: m(B),
    });

  it("takes the scrap price when it is lower (GG-K17)", () => {
    expect(scrap("GG-K17", 4, "13.500", 160_000)).toBe(405_000);
    expect(scrapKgMilli(4 * K, "13.500")).toBe(54 * K);
    const cost = costRepairLine(line("GG-K17", 40, 36, 4, 1_980_000), {
      needsRepairAvg: m(160_000),
      standardWeightKg: "13.500",
      scrapPricePerKg: m(7_500),
    });
    expect(cost).toEqual({
      needsRepairAvg: 160_000,
      scrapValue: 405_000,
      damage: 235_000,
      loss: 0,
      goodAmount: 7_975_000,
      goodUnitCost: 221_528,
    });
  });

  it("never prices scrap above its needs-repair cost (min)", () => {
    expect(scrap("GG-CH", 3, "2.800", 18_000)).toBe(54_000);
    const cost = costRepairLine(line("GG-CH", 5, 2, 3), {
      needsRepairAvg: m(18_000),
      standardWeightKg: "2.800",
      scrapPricePerKg: m(7_500),
    });
    expect(cost.damage).toBe(0);
  });

  it("rounds half a đồng up", () => {
    expect(scrap("GG-X", 1, "1.001", 1_000_000)).toBe(7_508);
  });

  it("books the damage as a loss when nothing is repaired (GG-M16)", () => {
    const cost = costRepairLine(line("GG-M16", 5, 0, 5), {
      needsRepairAvg: m(210_000),
      standardWeightKg: "12.000",
      scrapPricePerKg: m(7_500),
    });
    expect(cost).toMatchObject({
      scrapValue: 450_000,
      damage: 600_000,
      loss: 600_000,
      goodAmount: 0,
      goodUnitCost: null,
    });
  });

  it("needs no scrap price without scrap", () => {
    expect(scrap("GG-CH", 0, "2.800", 30_000, null)).toBe(0);
  });

  it("refuses a missing scrap price or weight", () => {
    expect(() => scrap("GG-K17", 4, "13.500", 160_000, null)).toThrow(
      REPAIR_MESSAGES.noScrapPrice,
    );
    expect(() => scrap("GG-XX", 4, null, 160_000)).toThrow(
      REPAIR_MESSAGES.noWeight("GG-XX"),
    );
  });
});

describe("goodUnitCost", () => {
  it.each<[string, number, number, number, number, number, number]>([
    ["with damage", 160_000, 36, 1_980_000, 235_000, 221_528, 7_975_000],
    ["even split", 160_000, 36, 1_980_000, 0, 215_000, 7_740_000],
    ["rounding down", 160_000, 3, 1_000_000, 0, 493_333, 1_480_000],
    ["exactly half rounds up", 160_000, 2, 1, 0, 160_001, 320_001],
    ["no cost", 160_000, 10, 0, 0, 160_000, 1_600_000],
    ["chéo", 30_000, 20, 240_000, 0, 42_000, 840_000],
  ])("%s", (_name, B, good, cost, damage, unit, amount) => {
    expect(goodUnitCost(m(B), good * K, m(cost), m(damage))).toBe(unit);
    const costed = costRepairLine(
      { itemCode: "X", goodMilli: good * K, scrapMilli: 0, repairCost: cost },
      {
        needsRepairAvg: m(B),
        standardWeightKg: "1.000",
        scrapPricePerKg: null,
      },
    );
    if (damage === 0) {
      expect(costed.goodAmount).toBe(amount);
      expect(costed.goodUnitCost).toBe(unit);
    }
    // The ledger shows the same unit cost for the same amount.
    expect(unitCostOf(m(amount), good * K)).toBe(unit);
  });

  it("shows the ÷ G parts rounded on their own", () => {
    expect(perRepairedPiece(m(1_980_000), 36 * K)).toBe(55_000);
    expect(perRepairedPiece(m(235_000), 36 * K)).toBe(6_528);
  });

  it("refuses zero repaired pieces", () => {
    expect(() => goodUnitCost(m(1), 0, m(0), m(0))).toThrow(RangeError);
    expect(() => perRepairedPiece(m(1), 0)).toThrow(RangeError);
  });
});

describe("repairPostingLines", () => {
  const places = { fromLocationId: "BAI-01", toLocationId: "BAI-01" };
  const facts = (B: number, weight = "13.500") => ({
    needsRepairAvg: m(B),
    standardWeightKg: weight,
    scrapPricePerKg: m(7_500),
  });
  const posting = (input: RepairLineInput, B: number, weight?: string) => ({
    itemId: input.itemId,
    itemCode: input.itemCode,
    takenMilli: input.takenMilli,
    goodMilli: input.goodMilli,
    scrapMilli: input.scrapMilli,
    cost: costRepairLine(input, facts(B, weight)),
  });

  it("writes out, Good, Scrap for the D12 line", () => {
    const drafts = repairPostingLines(
      "PSC-2026-024",
      [posting(line("GG-K17", 40, 36, 4, 1_980_000), 160_000)],
      places,
    );
    expect(
      drafts.map(({ movement, condition, quantityMilli, amount }) => ({
        movement,
        condition,
        quantityMilli,
        amount,
      })),
    ).toEqual([
      {
        movement: "REPAIR_OUT",
        condition: "NEEDS_REPAIR",
        quantityMilli: -40 * K,
        amount: undefined,
      },
      {
        movement: "REPAIR_IN",
        condition: "GOOD",
        quantityMilli: 36 * K,
        amount: 7_975_000,
      },
      {
        movement: "REPAIR_IN",
        condition: "SCRAP",
        quantityMilli: 4 * K,
        amount: 405_000,
      },
    ]);
  });

  it("leaves out zero lines", () => {
    const noScrap = repairPostingLines(
      "PSC-2026-024",
      [posting(line("GG-CH", 20, 20, 0, 240_000), 30_000, "2.800")],
      places,
    );
    expect(noScrap.map((d) => d.condition)).toEqual(["NEEDS_REPAIR", "GOOD"]);
    const allScrap = repairPostingLines(
      "PSC-2026-024",
      [posting(line("GG-M16", 5, 0, 5), 210_000, "12.000")],
      places,
    );
    expect(allScrap.map((d) => [d.condition, d.amount])).toEqual([
      ["NEEDS_REPAIR", undefined],
      ["SCRAP", 450_000],
    ]);
  });

  it("takes from one place and books into the other", () => {
    const drafts = repairPostingLines(
      "PSC-2026-024",
      [posting(line("GG-K17", 40, 36, 4, 1_980_000), 160_000)],
      { fromLocationId: "XUONG-01", toLocationId: "BAI-01" },
    );
    expect(drafts.map((d) => d.locationId)).toEqual([
      "XUONG-01",
      "BAI-01",
      "BAI-01",
    ]);
  });

  it("moves exactly the costs minus the losses (300 random slips)", () => {
    let seed = 11;
    const random = (max: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % max;
    };
    for (let run = 0; run < 300; run += 1) {
      const lines = Array.from({ length: 1 + random(5) }, (_, index) => {
        const good = random(60);
        const scrap = good === 0 ? 1 + random(20) : random(20);
        const cost = good === 0 ? 0 : random(5_000_000);
        const B = 1 + random(400_000);
        const weight = (1 + random(30_000)) / 1000;
        const input = line(`M${index}`, good + scrap, good, scrap, cost);
        return {
          B,
          posting: {
            itemId: input.itemId,
            itemCode: input.itemCode,
            takenMilli: input.takenMilli,
            goodMilli: input.goodMilli,
            scrapMilli: input.scrapMilli,
            cost: costRepairLine(input, {
              needsRepairAvg: m(B),
              standardWeightKg: weight.toFixed(3),
              scrapPricePerKg: m(1 + random(20_000)),
            }),
          },
          cost,
        };
      });
      const drafts = repairPostingLines(
        "PSC",
        lines.map((l) => l.posting),
        places,
      );
      const outValue = lines.reduce(
        (sum, l) => sum + (l.posting.takenMilli / K) * l.B,
        0,
      );
      const inValue = drafts.reduce((sum, d) => sum + (d.amount ?? 0), 0);
      const costs = lines.reduce((sum, l) => sum + l.cost, 0);
      const losses = lines.reduce((sum, l) => sum + l.posting.cost.loss, 0);
      expect(inValue - outValue).toBe(costs - losses);
      const quantities = drafts.reduce((sum, d) => sum + d.quantityMilli, 0);
      expect(quantities).toBe(0);
      for (const l of lines) {
        expect(l.posting.cost.scrapValue).toBeLessThanOrEqual(
          (l.posting.scrapMilli / K) * l.B,
        );
      }
    }
  });
});

describe("previewAverage", () => {
  const pool = (pieces: number, avg: number | null) => ({
    poolMilli: pieces * K,
    avgCost: avg === null ? null : m(avg),
  });

  it.each<[string, number, number | null, number, number, number]>([
    ["Tốt GG-K17", 1_120, 195_861, 36, 7_975_000, 196_660],
    ["Tốt chéo", 2_000, 38_500, 20, 840_000, 38_535],
    ["Phế liệu GG-K17", 42, 150_000, 4, 405_000, 145_761],
    ["Tốt never priced", 0, null, 5, 1_100_000, 220_000],
    ["empty pool ignores the old average", 0, 52_000, 5, 1_100_000, 220_000],
  ])("%s", (_name, pieces, avg, inPieces, amount, after) => {
    expect(previewAverage(pool(pieces, avg), inPieces * K, m(amount))).toBe(
      after,
    );
  });
});

describe("repairAnomalies", () => {
  const anomaly = (cost: number, good: number, avg: Money | null) =>
    repairAnomalies([
      {
        itemCode: "GG-K17",
        goodMilli: good * K,
        repairCost: cost,
        goodAvg: avg,
      },
    ]);

  it("asks when the cost per piece is above the Good average", () => {
    expect(anomaly(6_000_000, 20, m(195_861))).toEqual([
      {
        key: "line:GG-K17",
        field: "lines.0.repairCost",
        question:
          "GG-K17: chi phí sửa 300.000 ₫/cái, cao hơn giá vốn Tốt 195.861 ₫. Đúng không?",
        note: "chi phí cao GG-K17 300.000 ₫/cái",
      },
    ]);
  });

  it("does not ask at exactly the average, without an average or a repaired piece", () => {
    expect(anomaly(195_861 * 20, 20, m(195_861))).toEqual([]);
    expect(anomaly(6_000_000, 20, null)).toEqual([]);
    expect(anomaly(0, 0, m(195_861))).toEqual([]);
  });

  it("drops what was confirmed and writes the note", () => {
    const found = anomaly(6_000_000, 20, m(195_861));
    expect(unconfirmedAnomalies(found, ["line:GG-K17"])).toEqual([]);
    expect(repairPostedNote("PSC-2026-024", found)).toBe(
      "PSC-2026-024 · đã xác nhận chi phí cao GG-K17 300.000 ₫/cái",
    );
    expect(repairPostedNote("PSC-2026-024", [])).toBeNull();
  });
});
