import { describe, expect, it } from "vitest";

import {
  averageAfterInflow,
  lineAmount,
  roundHalfUp,
  unitCostOf,
} from "./average-cost";
import { toMoney } from "./money";

const pieces = (count: number) => count * 1000;
const money = toMoney;
const pool = (count: number, avg: number | null, milli = pieces(count)) => ({
  poolMilli: milli,
  avgCost: avg === null ? null : money(avg),
});

describe("roundHalfUp", () => {
  it("rounds halves away from zero", () => {
    expect(roundHalfUp(201n, 2n)).toBe(101n);
    expect(roundHalfUp(301n, 3n)).toBe(100n);
    expect(roundHalfUp(-201n, 2n)).toBe(-101n);
    expect(roundHalfUp(0n, 7n)).toBe(0n);
  });

  it("needs a positive denominator", () => {
    expect(() => roundHalfUp(1n, 0n)).toThrow(RangeError);
  });
});

describe("averageAfterInflow", () => {
  it("follows the worked example of design D11 (whole company pool)", () => {
    // 01/10: 1.220 in the yard + 2.000 at sites, 195.000 ₫.
    const afterPurchase = averageAfterInflow(
      pool(3220, 195_000),
      pieces(160),
      money(31_384_800),
    );
    expect(afterPurchase).toBe(195_055);
    const afterRepair = averageAfterInflow(
      pool(3380, afterPurchase),
      pieces(40),
      money(40 * 160_000 + 40 * 54_500),
    );
    expect(afterRepair).toBe(195_282);
  });

  it("is not the yard-only result of the D11 drawing", () => {
    const wrong = averageAfterInflow(
      pool(3220, 195_000),
      pieces(160),
      money(31_384_800),
    );
    expect(wrong).not.toBe(195_171);
  });

  it("follows the 920-piece chain of the spec", () => {
    const first = averageAfterInflow(
      pool(920, 195_000),
      pieces(160),
      money(31_384_800),
    );
    expect(first).toBe(195_171);
    expect(
      averageAfterInflow(pool(1080, first), pieces(40), money(8_580_000)),
    ).toBe(195_861);
  });

  it("counts stock at sites too (1.220 pieces → 195.134)", () => {
    expect(
      averageAfterInflow(pool(1220, 195_000), pieces(160), money(31_384_800)),
    ).toBe(195_134);
  });

  it("rounds an exact half up and less than half down", () => {
    expect(averageAfterInflow(pool(1, 100), pieces(1), money(101))).toBe(101);
    expect(averageAfterInflow(pool(2, 100), pieces(1), money(101))).toBe(100);
  });

  it("ignores the old average when the pool is empty", () => {
    expect(
      averageAfterInflow(pool(0, 52_000), pieces(500), money(27_500_000)),
    ).toBe(55_000);
    expect(
      averageAfterInflow(pool(0, null), pieces(500), money(27_500_000)),
    ).toBe(55_000);
  });

  it("works in kg", () => {
    expect(
      averageAfterInflow(pool(0, 8_000, 1_000_000), 500_500, money(4_254_250)),
    ).toBe(8_167);
  });

  it("does not overflow with big numbers", () => {
    expect(
      averageAfterInflow(
        pool(9_000_000, 1_000_000_000),
        pieces(1),
        money(999_999_999),
      ),
    ).toBe(1_000_000_000);
  });

  it("keeps the average when stock comes in at that average", () => {
    expect(
      averageAfterInflow(
        pool(3420, 195_282),
        pieces(40),
        lineAmount(pieces(40), money(195_282)),
      ),
    ).toBe(195_282);
  });

  it("refuses a non-positive quantity or a negative amount", () => {
    expect(() => averageAfterInflow(pool(1, 100), 0, money(100))).toThrow(
      "Dòng làm đổi giá vốn phải có số lượng dương",
    );
    expect(() =>
      averageAfterInflow(pool(1, 100), pieces(1), money(-1)),
    ).toThrow("Giá trị dòng nhập phải là số nguyên không âm");
    expect(() =>
      averageAfterInflow({ poolMilli: -1, avgCost: money(1) }, 1, money(1)),
    ).toThrow("Tồn tính giá vốn không được âm");
  });
});

describe("lineAmount and unitCostOf", () => {
  it("values a line at a unit cost, signed", () => {
    expect(lineAmount(pieces(-300), money(195_000))).toBe(-58_500_000);
    expect(lineAmount(570_500, money(8_167))).toBe(4_659_274);
  });

  it("shows the unit cost of an inflow", () => {
    expect(unitCostOf(money(31_384_800), pieces(160))).toBe(196_155);
    expect(unitCostOf(money(8_580_000), pieces(40))).toBe(214_500);
    expect(() => unitCostOf(money(1), 0)).toThrow();
  });
});
