import { describe, expect, it } from "vitest";

import { EMPTY_SPLIT, type ReceivingLine } from "./goods-receipt";
import { LANDED_COST_MESSAGES } from "./landed-cost";
import { toMoney, type Money } from "./money";
import {
  costTrip,
  needsScrapPrice,
  type TripCostInput,
  type TripLine,
} from "./receipt-cost";

const K = 1000;
const m = toMoney;

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

function line(
  id: string,
  open: Partial<ReceivingLine>,
  price: number,
  quantity: number,
  split: Partial<typeof EMPTY_SPLIT>,
  weighedKgMilli: number | null = null,
): TripLine {
  return {
    open: { ...base, orderLineId: id, itemCode: id, ...open },
    unitPrice: m(price),
    line: {
      orderLineId: id,
      status: quantity === 0 ? "NOT_IN_TRIP" : "COUNTED",
      quantityMilli: quantity,
      weighedKgMilli,
      split: { ...EMPTY_SPLIT, ...split },
      awaitsRest: quantity === 0,
    },
  };
}

/** Trip 1 of PO-2026-052, design D4. */
const TRIP_1: TripLine[] = [
  line("GG-K17", { standardWeightKg: "13.500" }, 185_000, 196 * K, {
    GOOD: 150 * K,
    NEEDS_REPAIR: 34 * K,
    SCRAP: 12 * K,
  }),
  line("GG-CH", { standardWeightKg: "2.800" }, 32_000, 400 * K, {
    GOOD: 380 * K,
    NEEDS_REPAIR: 20 * K,
  }),
  line("GG-M16", { standardWeightKg: "11.000" }, 145_000, 0, {}),
  line("PL-SAT", { itemUnit: "KG", lineUnit: "KG" }, 7_500, 1_250_500, {
    SCRAP: 1_250_500,
  }),
];

function trip(overrides: Partial<TripCostInput> = {}): TripCostInput {
  return {
    kind: "USED",
    method: "VALUE",
    lines: TRIP_1,
    costs: m(4_880_000),
    scrapPricePerKg: m(7_500),
    ...overrides,
  };
}

const ledgerTotal = (cost: ReturnType<typeof costTrip>) =>
  cost.lines
    .flatMap((costed) => Object.values(costed.byCondition) as Money[])
    .reduce((sum, value) => sum + value, 0);

describe("costTrip (design D4)", () => {
  it("costs trip 1 by value", () => {
    const cost = costTrip(trip());
    expect(cost.goods).toBe(58_438_750);
    expect(cost.lines.map((costed) => costed.orderLineId)).toEqual([
      "GG-K17",
      "GG-CH",
      "PL-SAT",
    ]);
    expect(cost.lines.map((costed) => costed.goods)).toEqual([
      36_260_000, 12_800_000, 9_378_750,
    ]);
    expect(cost.lines.map((costed) => costed.allocated)).toEqual([
      3_027_936, 1_068_880, 783_184,
    ]);
    expect(cost.lines.map((costed) => costed.byCondition)).toEqual([
      { GOOD: 31_037_720, NEEDS_REPAIR: 7_035_216, SCRAP: 1_215_000 },
      { GOOD: 13_175_436, NEEDS_REPAIR: 693_444 },
      { SCRAP: 10_161_934 },
    ]);
    expect(ledgerTotal(cost)).toBe(63_318_750);
  });

  it("costs trip 1 by weight", () => {
    const cost = costTrip(trip({ method: "WEIGHT" }));
    expect(cost.lines.map((costed) => costed.allocated)).toEqual([
      2_574_002, 1_089_524, 1_216_474,
    ]);
    expect(ledgerTotal(cost)).toBe(63_318_750);
  });

  it("costs trip 2 (Mâm, 500.000 ₫)", () => {
    const cost = costTrip(
      trip({
        costs: m(500_000),
        lines: [
          line("GG-M16", { standardWeightKg: "11.000" }, 145_000, 150 * K, {
            GOOD: 146 * K,
            NEEDS_REPAIR: 4 * K,
          }),
        ],
      }),
    );
    expect(cost.lines[0]?.byCondition).toEqual({
      GOOD: 21_656_667,
      NEEDS_REPAIR: 593_333,
    });
  });

  it("costs a trip without costs at the goods value", () => {
    const cost = costTrip(
      trip({
        costs: m(0),
        lines: [
          line("GG-M16", { standardWeightKg: "11.000" }, 145_000, 150 * K, {
            GOOD: 146 * K,
            NEEDS_REPAIR: 4 * K,
          }),
        ],
      }),
    );
    expect(cost.lines[0]?.byCondition).toEqual({
      GOOD: 21_170_000,
      NEEDS_REPAIR: 580_000,
    });
  });

  it("prices a kg line of a piece item by the kg weighed", () => {
    const byKg = line(
      "GG-K17",
      { lineUnit: "KG", standardWeightKg: "13.500" },
      14_000,
      146 * K,
      { GOOD: 146 * K },
      1_987_500,
    );
    const other = line("GG-CH", { standardWeightKg: "2.800" }, 0, 10 * K, {
      GOOD: 10 * K,
    });
    const cost = costTrip(
      trip({ lines: [byKg, other], method: "WEIGHT", costs: m(2_015_500) }),
    );
    expect(cost.lines[0]?.goods).toBe(27_825_000);
    // 1.987,5 kg weighed against 10 × 2,8 = 28 kg: 1 ₫ per gram.
    expect(cost.lines.map((costed) => costed.allocated)).toEqual([
      1_987_500, 28_000,
    ]);
  });

  it("puts all of a new-goods line into Mới", () => {
    const cost = costTrip(
      trip({
        kind: "NEW",
        costs: m(2_000_000),
        lines: [
          line("GG-K15", { standardWeightKg: "11.500" }, 210_000, 300 * K, {
            NEW: 300 * K,
          }),
        ],
      }),
    );
    expect(cost.lines[0]?.byCondition).toEqual({ NEW: 65_000_000 });
  });

  it("gives 0 ₫ to Tốt when the scrap is worth more than the lot", () => {
    const cost = costTrip(
      trip({
        costs: m(0),
        lines: [
          line("GG-K17", { standardWeightKg: "13.500" }, 80_000, 10 * K, {
            GOOD: 2 * K,
            SCRAP: 8 * K,
          }),
        ],
      }),
    );
    expect(cost.lines[0]?.byCondition).toEqual({ GOOD: 0, SCRAP: 800_000 });
  });

  it("needs the scrap price when scrap shares a lot", () => {
    expect(needsScrapPrice("USED", TRIP_1)).toBe(true);
    expect(needsScrapPrice("USED", TRIP_1.slice(1))).toBe(false);
    expect(needsScrapPrice("NEW", TRIP_1)).toBe(false);
    expect(() => costTrip(trip({ scrapPricePerKg: null }))).toThrow(
      LANDED_COST_MESSAGES.noScrapPrice,
    );
  });

  it("refuses splitting by value when the goods are worth 0 ₫", () => {
    expect(() =>
      costTrip(
        trip({
          costs: m(500_000),
          lines: [
            line("GG-CH", { standardWeightKg: "2.800" }, 0, 10 * K, {
              GOOD: 10 * K,
            }),
          ],
        }),
      ),
    ).toThrow(LANDED_COST_MESSAGES.zeroValue);
  });

  it("always books goods + costs to the đồng (300 random trips)", () => {
    let seed = 7;
    const next = (max: number) => {
      seed = (seed * 48_271) % 2_147_483_647;
      return seed % max;
    };
    for (let run = 0; run < 300; run += 1) {
      const lines = Array.from({ length: 1 + next(4) }, (_, index) => {
        const pieces = 1 + next(500);
        const scrap = next(pieces + 1);
        const good = next(pieces - scrap + 1);
        return line(
          `L${index}`,
          { standardWeightKg: "13.500" },
          1 + next(300_000),
          pieces * K,
          {
            GOOD: good * K,
            NEEDS_REPAIR: (pieces - scrap - good) * K,
            SCRAP: scrap * K,
          },
        );
      });
      const costs = m(next(10_000_000));
      const cost = costTrip(
        trip({
          lines,
          costs,
          method: next(2) === 0 ? "VALUE" : "WEIGHT",
          scrapPricePerKg: m(1 + next(20_000)),
        }),
      );
      expect(ledgerTotal(cost)).toBe(cost.goods + costs);
    }
  });
});
