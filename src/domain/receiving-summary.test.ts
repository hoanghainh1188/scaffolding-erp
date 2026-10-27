import { describe, expect, it } from "vitest";

import { toMoney } from "./money";
import {
  orderReceivingSummary,
  type SummaryOrderLine,
  type SummaryReceiptLine,
} from "./receiving-summary";

const K = 1000;
const m = toMoney;

/** PO-2026-051 of drawing D3b. */
const LINES: SummaryOrderLine[] = [
  ["khung", "PIECE", 200 * K, 190_000],
  ["cheo", "PIECE", 200 * K, 22_500],
  ["mam", "PIECE", 100 * K, 145_000],
  ["kich", "PIECE", 50 * K, 40_000],
  ["sat", "KG", 200 * K, 8_200],
].map(([id, unit, ordered, price]) => ({
  orderLineId: id as string,
  itemUnit: unit as "PIECE" | "KG",
  lineUnit: unit as "PIECE" | "KG",
  orderedMilli: ordered as number,
  unitPrice: m(price as number),
}));

const got = (
  id: string,
  quantity: number,
  awaitsRest = false,
): SummaryReceiptLine => ({
  orderLineId: id,
  status: quantity === 0 ? "NOT_IN_TRIP" : "COUNTED",
  quantityMilli: quantity,
  weighedKgMilli: null,
  awaitsRest,
});

const PN_090 = {
  tripNo: 1,
  lines: [
    got("khung", 120 * K, true),
    got("cheo", 200 * K),
    got("mam", 60 * K, true),
    got("kich", 0, true),
    got("sat", 212_500),
  ],
  costs: [{ amount: m(1_500_000) }, { amount: m(300_000) }],
};
const PN_093 = {
  tripNo: 2,
  lines: [got("khung", 80 * K), got("mam", 0, true), got("kich", 50 * K)],
  costs: [{ amount: m(500_000) }],
};

describe("orderReceivingSummary (drawing D3b)", () => {
  const summary = orderReceivingSummary({
    lines: LINES,
    receipts: [PN_093, PN_090],
    expectedCosts: m(1_500_000),
  });
  const byId = new Map(summary.lines.map((line) => [line.orderLineId, line]));

  it("adds every trip per line", () => {
    expect(byId.get("khung")).toMatchObject({
      receivedMilli: 200 * K,
      state: "FULL",
      amount: 38_000_000,
    });
    expect(byId.get("mam")).toMatchObject({
      receivedMilli: 60 * K,
      state: "SHORT_WAITING",
      gapMilli: 40 * K,
      amount: 8_700_000,
      difference: -5_800_000,
    });
    expect(byId.get("sat")).toMatchObject({
      receivedMilli: 212_500,
      state: "OVER",
      gapMilli: 12_500,
      amount: 1_742_500,
      difference: 102_500,
    });
  });

  it("owes the seller the goods received, not the costs", () => {
    expect(summary.payable).toBe(54_942_500);
    expect(summary.expectedGoods).toBe(60_640_000);
    expect(summary.actualCosts).toBe(2_300_000);
    expect(summary.expectedCosts).toBe(1_500_000);
    expect(summary.trips).toBe(2);
  });

  it("lists what is still awaited", () => {
    expect(summary.waiting.map((line) => line.orderLineId)).toEqual(["mam"]);
  });

  it("marks a line closed short and an order with no receipt", () => {
    const short = orderReceivingSummary({
      lines: LINES.slice(0, 1),
      receipts: [{ tripNo: 1, lines: [got("khung", 196 * K)], costs: [] }],
      expectedCosts: m(0),
    });
    expect(short.lines[0]).toMatchObject({
      state: "SHORT_CLOSED",
      gapMilli: 4 * K,
    });
    const none = orderReceivingSummary({
      lines: LINES,
      receipts: [],
      expectedCosts: m(0),
    });
    expect(none.payable).toBe(0);
    expect(none.lines.every((line) => line.state === "NONE")).toBe(true);
    expect(none.lines.every((line) => line.difference === 0)).toBe(true);
  });

  it("uses the weighed kg of a kg line of a piece item", () => {
    const byKg = orderReceivingSummary({
      lines: [
        {
          orderLineId: "khung",
          itemUnit: "PIECE",
          lineUnit: "KG",
          orderedMilli: 2_000 * K,
          unitPrice: m(14_000),
        },
      ],
      receipts: [
        {
          tripNo: 1,
          lines: [
            {
              orderLineId: "khung",
              status: "COUNTED",
              quantityMilli: 146 * K,
              weighedKgMilli: 1_987_500,
              awaitsRest: false,
            },
          ],
          costs: [],
        },
      ],
      expectedCosts: m(0),
    });
    expect(byKg.lines[0]).toMatchObject({
      receivedMilli: 1_987_500,
      amount: 27_825_000,
      state: "SHORT_CLOSED",
    });
  });
});
