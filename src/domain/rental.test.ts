import { describe, expect, it } from "vitest";

import type { BusinessDate } from "./business-date";
import {
  chargeableDays,
  DEFAULT_MIN_RENTAL_DAYS,
  dailyChange,
  dailyTotal,
  expectedValue,
  monthDisplay,
  rentAmount,
  rentalDays,
} from "./rental";

const d = (value: string) => value as BusinessDate;
const pieces = (count: number) => count * 1000;

/** Rent of `count` pieces at `price`/day issued and returned on two dates. */
function rent(count: number, price: number, issue: string, back: string) {
  const days = chargeableDays(
    rentalDays(d(issue), d(back)),
    DEFAULT_MIN_RENTAL_DAYS,
    pieces(count),
  );
  return rentAmount({ dailyPrice: price, quantityMilli: pieces(count), days });
}

describe("rental days (0.2 #4)", () => {
  it("counts from the day after issue to the return day", () => {
    expect(rentalDays(d("2026-11-01"), d("2027-03-21"))).toBe(140);
    expect(rentalDays(d("2026-11-01"), d("2026-11-01"))).toBe(0);
  });

  it("counts a leap February", () => {
    expect(rentalDays(d("2028-02-01"), d("2028-03-01"))).toBe(29);
  });

  it("refuses a return before the issue", () => {
    expect(() => rentalDays(d("2026-11-02"), d("2026-11-01"))).toThrow(
      "Ngày trả không được trước ngày xuất.",
    );
  });
});

describe("rent of a quantity (0.2 #4, #39)", () => {
  it("charges 140 days for 600 frames", () => {
    expect(rent(600, 1200, "2026-11-01", "2027-03-21")).toBe(100_800_000);
  });

  it("charges the 45-day minimum when returned after 20 days", () => {
    expect(rentalDays(d("2026-11-01"), d("2026-11-21"))).toBe(20);
    expect(rent(100, 1200, "2026-11-01", "2026-11-21")).toBe(5_400_000);
  });

  it("charges exactly 45 days when returned on day 45", () => {
    expect(rentalDays(d("2026-11-01"), d("2026-12-16"))).toBe(45);
    expect(rent(100, 1200, "2026-11-01", "2026-12-16")).toBe(5_400_000);
  });

  it("adds two parts returned on different days", () => {
    const early = rent(200, 1200, "2026-11-01", "2027-01-20");
    const late = rent(400, 1200, "2026-11-01", "2027-03-21");
    expect(early).toBe(19_200_000);
    expect(late).toBe(67_200_000);
    expect(early + late).toBe(86_400_000);
  });

  it("charges nothing for a quantity of 0, minimum or not", () => {
    expect(chargeableDays(20, 45, 0)).toBe(0);
    expect(rent(0, 1200, "2026-11-01", "2026-11-21")).toBe(0);
  });

  it("uses the contract's own minimum", () => {
    const days = chargeableDays(20, 30, pieces(100));
    expect(
      rentAmount({ dailyPrice: 1200, quantityMilli: pieces(100), days }),
    ).toBe(3_600_000);
  });

  it("adds the two price segments of an amendment", () => {
    const quantityMilli = pieces(600);
    const before = rentalDays(d("2026-11-01"), d("2026-12-14"));
    const after = rentalDays(d("2026-12-14"), d("2027-03-21"));
    expect([before, after]).toEqual([43, 97]);
    const total =
      rentAmount({ dailyPrice: 1200, quantityMilli, days: before }) +
      rentAmount({ dailyPrice: 1400, quantityMilli, days: after });
    expect(total).toBe(112_440_000);
  });

  it("rounds a weighed quantity to 1 ₫, half up", () => {
    // 12,345 kg × 40 ₫ × 1 day = 493,8 ₫
    expect(rentAmount({ dailyPrice: 40, quantityMilli: 12_345, days: 1 })).toBe(
      494,
    );
    // 0,5 kg × 1 ₫ × 1 day = 0,5 ₫: rounds up
    expect(rentAmount({ dailyPrice: 1, quantityMilli: 500, days: 1 })).toBe(1);
  });
});

describe("expected value (contracts spec)", () => {
  const total = dailyTotal([
    { dailyPrice: 1200, quantityMilli: pieces(600) },
    { dailyPrice: 300, quantityMilli: pieces(600) },
    { dailyPrice: 900, quantityMilli: pieces(300) },
    { dailyPrice: 400, quantityMilli: pieces(400) },
  ]);

  it("sums the day's rent of the lines", () => {
    expect(total).toBe(1_330_000);
  });

  it("multiplies by the planned days", () => {
    expect(
      expectedValue({
        dailyTotal: total,
        startDate: d("2026-11-01"),
        endDate: d("2027-03-21"),
        minDays: 45,
      }),
    ).toEqual({ days: 140, minimumApplied: false, amount: 186_200_000 });
  });

  it("uses the minimum when the plan is shorter", () => {
    expect(
      expectedValue({
        dailyTotal: 100_000,
        startDate: d("2026-11-01"),
        endDate: d("2026-11-21"),
        minDays: 45,
      }),
    ).toEqual({ days: 45, minimumApplied: true, amount: 4_500_000 });
  });

  it("refuses an end before the start", () => {
    expect(() =>
      expectedValue({
        dailyTotal: total,
        startDate: d("2026-11-01"),
        endDate: d("2026-10-31"),
        minDays: 45,
      }),
    ).toThrow("Ngày kết thúc phải sau ngày bắt đầu.");
  });
});

describe("month shown (giá ngày × số ngày của tháng)", () => {
  it("shows a 30-day and a 31-day month, never ÷ 30", () => {
    expect(monthDisplay(1_330_000)).toEqual([
      { days: 30, amount: 39_900_000 },
      { days: 31, amount: 41_230_000 },
    ]);
  });

  it("keeps the minimum in one place", () => {
    expect(DEFAULT_MIN_RENTAL_DAYS).toBe(45);
  });
});

describe("dailyChange", () => {
  const K = 1000;
  it("drops by what a transfer takes away", () => {
    expect(
      dailyChange(
        [],
        [
          { dailyPrice: 1_200, quantityMilli: 50 * K },
          { dailyPrice: 300, quantityMilli: 40 * K },
        ],
      ),
    ).toBe(-72_000);
  });

  it("drops by what a buy-back takes away", () => {
    expect(
      dailyChange(
        [],
        [
          { dailyPrice: 100, quantityMilli: 20 * K },
          { dailyPrice: 20, quantityMilli: 50 * K },
        ],
      ),
    ).toBe(-3_000);
  });

  it("nets an exchange", () => {
    expect(
      dailyChange(
        [{ dailyPrice: 280, quantityMilli: 100 * K }],
        [{ dailyPrice: 300, quantityMilli: 100 * K }],
      ),
    ).toBe(-2_000);
  });

  it("is 0 for nothing", () => {
    expect(dailyChange([], [{ dailyPrice: 300, quantityMilli: 0 }])).toBe(0);
  });
});
