// payables task 2.2: what one receipt owes the seller is the goods value of
// its lines, the same sum costTrip books and D3b shows; trip costs never
// add to it (0.2 #13, #26, #99).
import { describe, expect, it } from "vitest";

import { EMPTY_SPLIT, type ReceivingLine } from "./goods-receipt";
import { toMoney } from "./money";
import { costTrip, receiptPayable, type PayableLine } from "./receipt-cost";
import {
  orderReceivingSummary,
  type SummaryOrderLine,
} from "./receiving-summary";

const K = 1000;
const m = toMoney;

const open = (unit: "PIECE" | "KG", lineUnit = unit) => ({
  itemUnit: unit,
  lineUnit,
});

function payable(
  unit: "PIECE" | "KG",
  quantityMilli: number,
  price: number,
  extra: { lineUnit?: "PIECE" | "KG"; weighedKgMilli?: number } = {},
): PayableLine {
  return {
    open: open(unit, extra.lineUnit),
    unitPrice: m(price),
    line: {
      status: quantityMilli === 0 ? "NOT_IN_TRIP" : "COUNTED",
      quantityMilli,
      weighedKgMilli: extra.weighedKgMilli ?? null,
    },
  };
}

describe("receiptPayable", () => {
  it("is received pieces × the order price (PN-2026-091)", () => {
    expect(receiptPayable([payable("PIECE", 650 * K, 25_000)])).toBe(
      16_250_000,
    );
  });

  it("takes the kg weighed, not the kg ordered (PN-2026-090)", () => {
    expect(receiptPayable([payable("KG", 3_312_500, 8_000)])).toBe(26_500_000);
  });

  it("takes the weighed kg of a kg line of a piece item", () => {
    expect(
      receiptPayable([
        payable("PIECE", 120 * K, 8_000, {
          lineUnit: "KG",
          weighedKgMilli: 3_312_500,
        }),
      ]),
    ).toBe(26_500_000);
  });

  it("rounds each line on its own, half up", () => {
    expect(
      receiptPayable([
        payable("KG", 12_345, 7_500),
        payable("PIECE", 40 * K, 195_000),
      ]),
    ).toBe(92_588 + 7_800_000);
  });

  it("counts 0 for a line not in the trip", () => {
    expect(
      receiptPayable([
        payable("PIECE", 650 * K, 25_000),
        payable("PIECE", 0, 145_000),
      ]),
    ).toBe(16_250_000);
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

describe("one formula for the seller's money", () => {
  const tripLine = (
    id: string,
    unit: "PIECE" | "KG",
    price: number,
    quantity: number,
    split: Partial<typeof EMPTY_SPLIT>,
  ) => ({
    open: {
      ...base,
      orderLineId: id,
      itemCode: id,
      itemUnit: unit,
      lineUnit: unit,
      standardWeightKg: unit === "PIECE" ? "13.500" : null,
    },
    unitPrice: m(price),
    line: {
      orderLineId: id,
      status: quantity === 0 ? ("NOT_IN_TRIP" as const) : ("COUNTED" as const),
      quantityMilli: quantity,
      weighedKgMilli: null,
      split: { ...EMPTY_SPLIT, ...split },
      awaitsRest: false,
    },
  });
  const tripOne = [
    tripLine("GG-K17", "PIECE", 185_000, 196 * K, {
      GOOD: 150 * K,
      NEEDS_REPAIR: 34 * K,
      SCRAP: 12 * K,
    }),
    tripLine("GG-CH", "PIECE", 32_000, 400 * K, {
      GOOD: 380 * K,
      NEEDS_REPAIR: 20 * K,
    }),
    tripLine("GG-M16", "PIECE", 145_000, 0, {}),
    tripLine("PL-SAT", "KG", 7_500, 1_250_500, { SCRAP: 1_250_500 }),
  ];
  const tripTwo = [
    tripLine("GG-M16", "PIECE", 145_000, 150 * K, {
      GOOD: 146 * K,
      NEEDS_REPAIR: 4 * K,
    }),
  ];

  it("matches costTrip's goods, whatever the trip costs", () => {
    const costed = costTrip({
      kind: "USED",
      method: "VALUE",
      lines: tripOne,
      costs: m(4_880_000),
      scrapPricePerKg: m(7_500),
    });
    expect(receiptPayable(tripOne)).toBe(costed.goods);
    expect(receiptPayable(tripOne)).toBe(58_438_750);
  });

  it("adds up over the trips to D3b's payable", () => {
    const lines: SummaryOrderLine[] = tripOne.map((t) => ({
      orderLineId: t.open.orderLineId,
      itemUnit: t.open.itemUnit,
      lineUnit: t.open.lineUnit,
      orderedMilli: 400 * K,
      unitPrice: t.unitPrice,
    }));
    const summary = orderReceivingSummary({
      lines,
      receipts: [tripOne, tripTwo].map((trip, index) => ({
        tripNo: index + 1,
        lines: trip.map((t) => t.line),
        costs: [{ amount: m(500_000) }],
      })),
      expectedCosts: m(0),
    });
    expect(receiptPayable(tripOne) + receiptPayable(tripTwo)).toBe(
      summary.payable,
    );
    expect(summary.payable).toBe(80_188_750);
  });
});
