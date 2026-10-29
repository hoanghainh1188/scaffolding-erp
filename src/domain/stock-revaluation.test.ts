import { describe, expect, it } from "vitest";

import type { CostPool } from "./average-cost";
import { EMPTY_SPLIT, type ReceivingLine } from "./goods-receipt";
import { toMoney } from "./money";
import { costTrip, type TripLine } from "./receipt-cost";
import {
  assertValueDelta,
  assertValueLines,
  averageAfterRevalue,
  poolValue,
  revaluationFromTrip,
  revaluationMovements,
  signedMoney,
  type TripRevaluationInput,
} from "./stock-revaluation";

const K = 1000;
const m = toMoney;
const pool = (pieces: number, avg: number | null): CostPool => ({
  poolMilli: Math.round(pieces * K),
  avgCost: avg === null ? null : m(avg),
});
const good = { code: "GG-K17", condition: "GOOD" as const };

describe("averageAfterRevalue", () => {
  it("lowers the average over the whole pool", () => {
    expect(poolValue(pool(1240, 195_282))).toBe(242_149_680);
    expect(averageAfterRevalue(pool(1240, 195_282), m(-1_500_000), good)).toBe(
      194_072,
    );
  });

  it("counts stock at sites (920 yard + 300 site)", () => {
    expect(averageAfterRevalue(pool(1220, 195_000), m(610_000), good)).toBe(
      195_500,
    );
  });

  it("rounds halves up both ways", () => {
    const ch = { code: "GG-CH", condition: "GOOD" as const };
    expect(averageAfterRevalue(pool(2, 100), m(1), ch)).toBe(101);
    expect(averageAfterRevalue(pool(2, 100), m(-1), ch)).toBe(100);
  });

  it("works on kg items", () => {
    const pl = { code: "PL-SAT", condition: "SCRAP" as const };
    expect(poolValue(pool(12_850.5, 7_952))).toBe(102_187_176);
    expect(averageAfterRevalue(pool(12_850.5, 7_952), m(500_000), pl)).toBe(
      7_991,
    );
  });

  it("uses the pool at approval", () => {
    expect(averageAfterRevalue(pool(1400, 195_300), m(-1_500_000), good)).toBe(
      194_229,
    );
  });

  it("refuses an empty pool", () => {
    const ku = { code: "PK-KU", condition: "NEW" as const };
    expect(() => averageAfterRevalue(pool(0, 52_000), m(300_000), ku)).toThrow(
      "PK-KU Mới đã hết hàng, không điều chỉnh giá trị được",
    );
    expect(() => averageAfterRevalue(pool(0, null), m(300_000), ku)).toThrow(
      "đã hết hàng",
    );
  });

  it("refuses a negative value but allows exactly 0", () => {
    const scrap = { code: "GG-K17", condition: "SCRAP" as const };
    expect(() =>
      averageAfterRevalue(pool(42, 160_000), m(-7_000_000), scrap),
    ).toThrow("Giá trị sau điều chỉnh của GG-K17 Phế liệu bị âm (−280.000 ₫)");
    expect(averageAfterRevalue(pool(42, 160_000), m(-6_720_000), scrap)).toBe(
      0,
    );
  });

  it("does not overflow on large numbers", () => {
    expect(
      averageAfterRevalue(pool(9_000_000, 1_000_000_000), m(1), good),
    ).toBe(1_000_000_000);
    expect(
      averageAfterRevalue(
        pool(9_000_000, 1_000_000_000),
        m(-4_500_000_000_000),
        good,
      ),
    ).toBe(999_500_000);
  });
});

describe("value lines", () => {
  it("wants a whole, non-zero change", () => {
    expect(() => assertValueDelta(0)).toThrow("Chênh lệch giá trị phải khác 0");
    expect(() => assertValueDelta(-1_500_000.5)).toThrow(
      "Chênh lệch giá trị phải là số nguyên đồng",
    );
    expect(assertValueDelta(-1_500_000)).toBe(-1_500_000);
  });

  it("refuses the same item and condition twice", () => {
    const line = {
      itemId: "k17",
      condition: "GOOD" as const,
      valueDelta: m(1),
    };
    expect(() =>
      assertValueLines([line, { ...line, valueDelta: m(2) }], () => "GG-K17"),
    ).toThrow("GG-K17 Tốt đã có trên phiếu");
    expect(() =>
      assertValueLines([line, { ...line, condition: "NEW" }], () => "GG-K17"),
    ).not.toThrow();
  });

  it("turns each line into one REVALUE ledger line", () => {
    expect(
      revaluationMovements("PN-2026-094", [
        { itemId: "k17", condition: "GOOD", valueDelta: m(-1_500_000) },
        { itemId: "ch", condition: "NEW", valueDelta: m(610_000) },
      ]),
    ).toEqual([
      {
        itemId: "k17",
        condition: "GOOD",
        locationId: null,
        movement: "REVALUE",
        quantityMilli: 0,
        amount: -1_500_000,
        description: "Giảm giá trị 1.500.000 ₫ · sửa PN-2026-094",
      },
      {
        itemId: "ch",
        condition: "NEW",
        locationId: null,
        movement: "REVALUE",
        quantityMilli: 0,
        amount: 610_000,
        description: "Tăng giá trị 610.000 ₫ · sửa PN-2026-094",
      },
    ]);
  });

  it("writes signed money with a real minus", () => {
    expect(signedMoney(-31_500_000)).toBe("−31.500.000 ₫");
    expect(signedMoney(610_000)).toBe("+610.000 ₫");
  });
});

const base: ReceivingLine = {
  orderLineId: "",
  itemCode: "",
  itemUnit: "PIECE",
  lineUnit: "PIECE",
  standardWeightKg: null,
  orderedMilli: 0,
  receivedMilli: 0,
  lastAwaitsRest: null,
};

function tripLine(
  id: string,
  price: number,
  pieces: number,
  split: Partial<typeof EMPTY_SPLIT>,
  open: Partial<ReceivingLine> = {},
): TripLine {
  return {
    open: { ...base, orderLineId: id, itemCode: id, ...open },
    unitPrice: m(price),
    line: {
      orderLineId: id,
      status: "COUNTED",
      quantityMilli: pieces * K,
      weighedKgMilli: null,
      split: { ...EMPTY_SPLIT, ...split },
      awaitsRest: false,
    },
  };
}

/** PN-2026-094: 200 GG-K17 Mới × 185.000, 400 GG-CH Mới × 32.000. */
function newTrip(
  overrides: Partial<TripRevaluationInput> = {},
): TripRevaluationInput {
  return {
    receiptCode: "PN-2026-094",
    trip: {
      kind: "NEW",
      method: "VALUE",
      scrapPricePerKg: null,
      lines: [
        tripLine("l1", 185_000, 200, { NEW: 200 * K }),
        tripLine("l2", 32_000, 400, { NEW: 400 * K }),
      ],
    },
    itemOf: new Map([
      ["l1", "k17"],
      ["l2", "ch"],
    ]),
    recordedCost: m(35_000_000),
    correctedCost: 3_500_000,
    booked: new Map([
      ["k17|NEW", 37_000_000 + 26_004_016],
      ["ch|NEW", 12_800_000 + 8_995_984],
    ]),
    ...overrides,
  };
}

describe("revaluationFromTrip", () => {
  it("re-splits a mistyped trip cost like the receipt did", () => {
    const lines = revaluationFromTrip(newTrip());
    expect(lines).toEqual([
      { itemId: "k17", condition: "NEW", valueDelta: -23_403_614 },
      { itemId: "ch", condition: "NEW", valueDelta: -8_096_386 },
    ]);
    expect(lines.reduce((sum, l) => sum + l.valueDelta, 0)).toBe(-31_500_000);
  });

  it("brings the averages back when all stock is still there", () => {
    const [k17, ch] = revaluationFromTrip(newTrip());
    expect(
      averageAfterRevalue(pool(200, 315_020), m(k17?.valueDelta ?? 0), {
        code: "GG-K17",
        condition: "NEW",
      }),
    ).toBe(198_002);
    expect(
      averageAfterRevalue(pool(400, 54_490), m(ch?.valueDelta ?? 0), {
        code: "GG-CH",
        condition: "NEW",
      }),
    ).toBe(34_249);
    expect(
      averageAfterRevalue(pool(150, 315_020), m(k17?.valueDelta ?? 0), {
        code: "GG-K17",
        condition: "NEW",
      }),
    ).toBe(158_996);
  });

  it("keeps the scrap part of a used lot", () => {
    const trip: TripRevaluationInput["trip"] = {
      kind: "USED",
      method: "VALUE",
      scrapPricePerKg: m(7_500),
      lines: [
        tripLine(
          "l1",
          185_000,
          200,
          { GOOD: 150 * K, NEEDS_REPAIR: 38 * K, SCRAP: 12 * K },
          { standardWeightKg: "13.500" },
        ),
        tripLine("l2", 32_000, 400, { GOOD: 400 * K }),
      ],
    };
    const itemOf = new Map([
      ["l1", "k17"],
      ["l2", "ch"],
    ]);
    // What the receipt booked with 35.000.000 ₫, as posting computed it.
    const booked = new Map<string, number>();
    for (const line of costTrip({ ...trip, costs: m(35_000_000) }).lines) {
      for (const [condition, value] of Object.entries(line.byCondition)) {
        booked.set(`${itemOf.get(line.orderLineId)}|${condition}`, value);
      }
    }
    expect(booked.get("k17|SCRAP")).toBe(1_215_000);
    const lines = revaluationFromTrip({
      receiptCode: "PN-2026-095",
      trip,
      itemOf,
      recordedCost: m(35_000_000),
      correctedCost: 3_500_000,
      booked,
    });
    expect(lines.find((l) => l.condition === "SCRAP")).toBeUndefined();
    expect(
      lines
        .filter((l) => l.itemId === "k17")
        .reduce((sum, l) => sum + l.valueDelta, 0),
    ).toBe(-23_403_614);
  });

  it("only takes the difference on a second correction", () => {
    const after = new Map([
      ["k17|NEW", 37_000_000 + 2_600_402],
      ["ch|NEW", 12_800_000 + 899_598],
    ]);
    const lines = revaluationFromTrip(
      newTrip({
        recordedCost: m(3_500_000),
        correctedCost: 3_800_000,
        booked: after,
      }),
    );
    expect(lines.reduce((sum, l) => sum + l.valueDelta, 0)).toBe(300_000);
  });

  it("refuses an unchanged cost and a bad cost", () => {
    expect(() =>
      revaluationFromTrip(newTrip({ correctedCost: 35_000_000 })),
    ).toThrow("Chi phí chuyến không đổi, không có gì để điều chỉnh");
    expect(() => revaluationFromTrip(newTrip({ correctedCost: -1 }))).toThrow(
      "Chi phí chuyến phải là số nguyên không âm",
    );
  });

  it("refuses when the recorded cost no longer gives the booked values", () => {
    expect(() =>
      revaluationFromTrip(
        newTrip({
          booked: new Map([
            ["k17|NEW", 37_000_000 + 26_004_016 + 1],
            ["ch|NEW", 12_800_000 + 8_995_984],
          ]),
        }),
      ),
    ).toThrow("Không dựng lại được cách chia của PN-2026-094, lập dòng tay");
  });
});
