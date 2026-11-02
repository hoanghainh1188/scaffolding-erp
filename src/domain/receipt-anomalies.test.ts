import { dict } from "@/locales";
import { describe, expect, it } from "vitest";

import {
  EMPTY_SPLIT,
  type ReceiptLineInput,
  type ReceivingLine,
} from "./goods-receipt";
import { toMoney } from "./money";
import {
  receiptAnomalies,
  receiptPostedNote,
  unconfirmedAnomalies,
  type AnomalyLine,
} from "./receipt-anomalies";

const K = 1000;
const m = toMoney;

const KHUNG: ReceivingLine = {
  orderLineId: "khung",
  itemCode: "GG-K17",
  itemUnit: "PIECE",
  lineUnit: "PIECE",
  standardWeightKg: "13.500",
  orderedMilli: 200 * K,
  receivedMilli: 0,
  lastAwaitsRest: null,
};
const CHEO: ReceivingLine = {
  ...KHUNG,
  orderLineId: "cheo",
  itemCode: "GG-CH",
  orderedMilli: 400 * K,
};
const SAT: ReceivingLine = {
  ...KHUNG,
  orderLineId: "sat",
  itemCode: "PL-SAT",
  itemUnit: "KG",
  lineUnit: "KG",
  standardWeightKg: null,
  orderedMilli: 200 * K,
};
const KHUNG_KG: ReceivingLine = {
  ...KHUNG,
  orderLineId: "khung-kg",
  lineUnit: "KG",
  orderedMilli: 2_000 * K,
};

function counted(
  open: ReceivingLine,
  quantity: number,
  weighedKgMilli: number | null = null,
): AnomalyLine {
  const line: ReceiptLineInput = {
    orderLineId: open.orderLineId,
    status: "COUNTED",
    quantityMilli: quantity,
    weighedKgMilli,
    split: { ...EMPTY_SPLIT, GOOD: quantity },
    awaitsRest: false,
  };
  return { open, line };
}

const anomalies = (
  lines: AnomalyLine[],
  tripCosts = 0,
  expectedCosts = 4_880_000,
) =>
  receiptAnomalies({
    lines,
    tripCosts: m(tripCosts),
    expectedCosts: m(expectedCosts),
  });

describe("receiptAnomalies (design D5b)", () => {
  it("asks about a stray zero on a piece line", () => {
    expect(
      anomalies([counted(CHEO, 400 * K), counted(KHUNG, 2_000 * K)]),
    ).toEqual([
      {
        key: "line:khung",
        field: "lines.1.quantity",
        question: dict.receiving.anomalies.piecesOver("2.000", "200"),
        note: "nhận dư GG-K17 2.000/200 cái",
      },
    ]);
  });

  it("asks about one extra piece and not about the exact count", () => {
    expect(anomalies([counted(CHEO, 401 * K)])[0]?.question).toBe(
      dict.receiving.anomalies.piecesOver("401", "400"),
    );
    expect(anomalies([counted(CHEO, 400 * K)])).toEqual([]);
  });

  it("lets a kg line pass at exactly 10 % and asks above it", () => {
    expect(anomalies([counted(SAT, 220 * K)])).toEqual([]);
    expect(anomalies([counted(SAT, 220_500)])[0]?.question).toBe(
      dict.receiving.anomalies.kgOver("220,5", "200"),
    );
  });

  it("compares a kg line of a piece item by the kg weighed", () => {
    expect(anomalies([counted(KHUNG_KG, 146 * K, 2_250 * K)])).toEqual([
      {
        key: "line:khung-kg",
        field: "lines.0.weighedKg",
        question: dict.receiving.anomalies.kgOver("2.250", "2.000"),
        note: "nhận dư GG-K17 2.250/2.000 kg",
      },
    ]);
  });

  it("counts what earlier receipts already brought", () => {
    const partly = { ...KHUNG, receivedMilli: 100 * K };
    expect(anomalies([counted(partly, 150 * K)])[0]?.question).toBe(
      dict.receiving.anomalies.piecesOver("150", "100"),
    );
  });

  it("asks about trip costs above the whole order's expected costs", () => {
    expect(anomalies([counted(KHUNG, 196 * K)], 35_000_000)).toEqual([
      {
        key: "costs",
        field: "costs",
        question: dict.receiving.anomalies.costsOver(
          "35.000.000 ₫",
          "4.880.000 ₫",
        ),
        note: "chi phí cao 35.000.000 ₫",
      },
    ]);
    expect(anomalies([counted(KHUNG, 196 * K)], 4_880_000)).toEqual([]);
  });

  it("asks about any cost when the order expected none", () => {
    expect(anomalies([counted(KHUNG, 196 * K)], 500_000, 0)).toHaveLength(1);
  });

  it("skips not-in-trip lines", () => {
    const line = counted(KHUNG, 0);
    expect(
      anomalies([{ ...line, line: { ...line.line, status: "NOT_IN_TRIP" } }]),
    ).toEqual([]);
  });

  it("drops what was confirmed and ignores extra keys", () => {
    const found = anomalies([counted(KHUNG, 2_000 * K)], 35_000_000);
    expect(
      unconfirmedAnomalies(found, ["line:khung", "line:other"]).map(
        (anomaly) => anomaly.key,
      ),
    ).toEqual(["costs"]);
  });

  it("writes the history note", () => {
    const found = anomalies([counted(KHUNG, 2_000 * K)], 35_000_000);
    expect(receiptPostedNote("PN-2026-094", found)).toBe(
      "PN-2026-094 · đã xác nhận nhận dư GG-K17 2.000/200 cái; chi phí cao 35.000.000 ₫",
    );
    expect(receiptPostedNote("PN-2026-094", [])).toBe("PN-2026-094");
  });
});
