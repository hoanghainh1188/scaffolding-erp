// Revenue by day (dashboard-basic tasks 2.2, 2.2a, 2.3; spec sales-revenue).
// Every statement built here is also checked: its days add up to beforeVat.
import { describe, expect, it } from "vitest";

import type { BusinessDate } from "./business-date";
import {
  adjustmentDay,
  dailyRevenue,
  dailyRevenueOfClosed,
  datesBetween,
  spreadEvenly,
  splitIntoDays,
  type ClosedLine,
  type DailySplit,
} from "./daily-revenue";
import {
  buildStatement,
  periodOf,
  type BillingTerms,
  type FreightInput,
  type Statement,
  type StatementAdjustment,
} from "./rental-billing";
import type { HolidayRange } from "./rental-holiday";
import { buildPieces, type RentalEvent } from "./rental-lots";

const d = (value: string) => value as BusinessDate;
const ITEMS = new Map([["KU", { code: "PK-KU", name: "Kích tăng U" }]]);

const terms = (
  number: number,
  effectiveFrom: string,
  price: number,
): BillingTerms => ({
  number,
  status: "APPROVED",
  effectiveFrom,
  code: number === 0 ? "HD" : `HD/0${number}`,
  minRentalDays: 45,
  paymentTermsDays: 30,
  vatBasisPoints: null,
  prices: new Map([["KU", price]]),
});

let order = 0;
const event = (
  direction: "IN" | "OUT",
  date: string,
  pieces: number,
): RentalEvent => ({
  itemId: "KU",
  direction,
  milli: pieces * 1000,
  date: d(date),
  order: ++order,
  doc:
    direction === "IN"
      ? { type: "DELIVERY_NOTE", id: `PX${order}`, code: `PX${order}` }
      : { type: "RETURN_NOTE", id: `TH${order}`, code: `TH${order}` },
  ...(direction === "OUT" ? { endKind: "RETURN" as const } : {}),
});

function statement(input: {
  month: string;
  today: string;
  events: RentalEvent[];
  terms?: BillingTerms[];
  holidays?: HolidayRange[];
  freight?: FreightInput[];
  adjustments?: StatementAdjustment[];
}): Statement {
  return buildStatement({
    period: periodOf(input.month),
    today: d(input.today),
    pieces: buildPieces(input.events),
    terms: input.terms ?? [terms(0, "2026-01-01", 1_000)],
    holidays: input.holidays ?? [],
    items: ITEMS,
    freight: input.freight ?? [],
    adjustments: input.adjustments ?? [],
  });
}

const adjustment = (amount: number, at: string): StatementAdjustment => ({
  id: `adj-${at}`,
  refMonth: "2026-09",
  amount,
  reason: "Sai số kỳ trước",
  createdByName: "Thu Hà",
  createdAt: new Date(at),
  updatedAt: new Date(at),
});

const amountOn = (split: DailySplit, date: string) =>
  split.days.get(d(date)) ?? 0;

function expectMatchesStatement(split: DailySplit, built: Statement) {
  expect(split.total).toBe(built.beforeVat);
  expect([...split.days.values()].reduce((a, b) => a + b, 0)).toBe(
    built.beforeVat,
  );
  expect(split.mismatches).toEqual([]);
}

describe("spreadEvenly", () => {
  it("gives the remainder to the earliest days", () => {
    const parts = spreadEvenly(100_000, [
      d("2026-11-01"),
      d("2026-11-02"),
      d("2026-11-03"),
    ]);
    expect(parts.map(([, amount]) => amount)).toEqual([33_334, 33_333, 33_333]);
  });

  it("keeps the sign of a negative amount", () => {
    const parts = spreadEvenly(-10, [d("2026-11-01"), d("2026-11-02")]);
    expect(parts.map(([, amount]) => amount)).toEqual([-5, -5]);
  });

  it("returns nothing for no day or zero", () => {
    expect(spreadEvenly(100, [])).toEqual([]);
    expect(spreadEvenly(0, [d("2026-11-01")])).toEqual([]);
  });
});

describe("datesBetween", () => {
  it("includes both ends and is empty when reversed", () => {
    expect(datesBetween(d("2026-10-30"), d("2026-11-01"))).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(datesBetween(d("2026-11-02"), d("2026-11-01"))).toEqual([]);
  });
});

describe("dailyRevenue of an open statement", () => {
  it("splits a rent line evenly over its days", () => {
    const built = statement({
      month: "2026-11",
      today: "2026-11-06",
      events: [event("IN", "2026-10-15", 40)],
    });
    const split = dailyRevenue(built, []);
    for (const day of datesBetween(d("2026-11-01"), d("2026-11-06"))) {
      expect(amountOn(split, day)).toBe(40_000);
    }
    expect(split.total).toBe(240_000);
    expectMatchesStatement(split, built);
  });

  it("skips holidays", () => {
    const tet: HolidayRange = {
      name: "Tết",
      startDate: d("2027-02-05"),
      endDate: d("2027-02-13"),
    };
    const built = statement({
      month: "2027-02",
      today: "2027-02-15",
      events: [event("IN", "2027-02-03", 10)],
      terms: [terms(0, "2027-01-01", 2_000)],
      holidays: [tet],
    });
    const split = dailyRevenue(built, [tet]);
    expect([...split.days.keys()]).toEqual([
      "2027-02-04",
      "2027-02-14",
      "2027-02-15",
    ]);
    expect(amountOn(split, "2027-02-04")).toBe(20_000);
    expectMatchesStatement(split, built);
  });

  it("follows a return in the middle of the month", () => {
    const built = statement({
      month: "2026-11",
      today: "2026-11-20",
      events: [event("IN", "2026-08-01", 50), event("OUT", "2026-11-10", 30)],
      terms: [terms(0, "2026-01-01", 1_500)],
    });
    const split = dailyRevenue(built, []);
    expect(amountOn(split, "2026-11-10")).toBe(75_000);
    expect(amountOn(split, "2026-11-11")).toBe(30_000);
    expect(amountOn(split, "2026-11-20")).toBe(30_000);
    expectMatchesStatement(split, built);
  });

  it("follows a price change", () => {
    const built = statement({
      month: "2026-11",
      today: "2026-12-05",
      events: [event("IN", "2026-08-01", 10)],
      terms: [terms(0, "2026-01-01", 1_000), terms(1, "2026-11-16", 1_200)],
    });
    const split = dailyRevenue(built, []);
    expect(amountOn(split, "2026-11-15")).toBe(10_000);
    expect(amountOn(split, "2026-11-16")).toBe(12_000);
    expectMatchesStatement(split, built);
  });

  it("puts the minimum top-up on the return date", () => {
    const built = statement({
      month: "2026-10",
      today: "2026-11-06",
      events: [event("IN", "2026-10-01", 20), event("OUT", "2026-10-21", 20)],
    });
    const split = dailyRevenue(built, []);
    expect(amountOn(split, "2026-10-21")).toBe(20_000 + 500_000);
    expectMatchesStatement(split, built);
  });

  it("puts rental freight on the delivery day", () => {
    const built = statement({
      month: "2026-11",
      today: "2026-11-06",
      events: [event("IN", "2026-11-03", 10)],
      freight: [
        {
          deliveryNoteId: "PX1",
          code: "PX1",
          batchNo: 1,
          vehiclePlate: null,
          date: d("2026-11-03"),
          amount: 1_500_000,
        },
      ],
    });
    const split = dailyRevenue(built, []);
    expect(amountOn(split, "2026-11-03")).toBe(1_500_000);
    expectMatchesStatement(split, built);
  });

  it("counts a past month that is not closed to its end", () => {
    const built = statement({
      month: "2026-09",
      today: "2026-11-06",
      events: [event("IN", "2026-08-01", 10)],
    });
    const split = dailyRevenue(built, []);
    expect(split.days.size).toBe(30);
    expect(split.total).toBe(300_000);
    expectMatchesStatement(split, built);
  });

  it("has nothing once the goods are back", () => {
    const built = statement({
      month: "2026-11",
      today: "2026-11-20",
      events: [event("IN", "2026-08-01", 10), event("OUT", "2026-10-31", 10)],
    });
    expect(dailyRevenue(built, []).total).toBe(0);
  });
});

describe("adjustment lines (0.2 #80)", () => {
  const events = () => [event("IN", "2026-08-01", 10)];

  it("count on the day they were written, Vietnam time", () => {
    // 04/11 09:00 in Vietnam is 04/11 02:00 UTC.
    const adj = adjustment(-200_000, "2026-11-04T02:00:00Z");
    const on06 = dailyRevenue(
      statement({
        month: "2026-11",
        today: "2026-11-06",
        events: events(),
        adjustments: [adj],
      }),
      [],
    );
    const on20 = dailyRevenue(
      statement({
        month: "2026-11",
        today: "2026-11-20",
        events: events(),
        adjustments: [adj],
      }),
      [],
    );
    expect(amountOn(on06, "2026-11-04")).toBe(10_000 - 200_000);
    expect(amountOn(on20, "2026-11-04")).toBe(10_000 - 200_000);
    expect(amountOn(on06, "2026-11-06")).toBe(10_000);
  });

  it("uses the Vietnamese day near midnight", () => {
    const period = periodOf("2026-11");
    expect(adjustmentDay(new Date("2026-11-04T17:30:00Z"), period)).toBe(
      "2026-11-05",
    );
  });

  it("is clamped into the period", () => {
    const period = periodOf("2026-10");
    expect(adjustmentDay(new Date("2026-11-03T03:00:00Z"), period)).toBe(
      "2026-10-31",
    );
    expect(adjustmentDay(new Date("2026-09-20T03:00:00Z"), period)).toBe(
      "2026-10-01",
    );
  });

  it("makes a day negative without cutting it to zero", () => {
    const built = statement({
      month: "2026-11",
      today: "2026-11-06",
      events: [event("IN", "2026-08-01", 300)],
      adjustments: [adjustment(-500_000, "2026-11-04T02:00:00Z")],
    });
    const split = dailyRevenue(built, []);
    expect(amountOn(split, "2026-11-04")).toBe(-200_000);
    expectMatchesStatement(split, built);
  });

  it("lands on the same day before and after closing", () => {
    const adj = adjustment(-200_000, "2026-11-04T02:00:00Z");
    const open = dailyRevenue(
      statement({
        month: "2026-11",
        today: "2026-12-02",
        events: events(),
        adjustments: [adj],
      }),
      [],
    );
    const closed = dailyRevenueOfClosed(
      {
        period: periodOf("2026-11"),
        contractCode: "HD",
        lines: [
          closedRent(1, "2026-11-01", "2026-11-30", 30, 300_000),
          {
            lineNo: 2,
            kind: "ADJUSTMENT",
            amount: -200_000,
            fromDate: null,
            toDate: null,
            chargedDays: null,
            outDate: null,
            adjustmentCreatedAt: adj.createdAt,
          },
        ],
        freight: [],
      },
      [],
    );
    expect([...closed.days.entries()]).toEqual([...open.days.entries()]);
  });
});

function closedRent(
  lineNo: number,
  from: string,
  to: string,
  chargedDays: number,
  amount: number,
): ClosedLine {
  return {
    lineNo,
    kind: "RENT",
    amount,
    fromDate: d(from),
    toDate: d(to),
    chargedDays,
    outDate: null,
    adjustmentCreatedAt: null,
  };
}

describe("dailyRevenueOfClosed", () => {
  it("adds up to rent + adjustment + freight of the period", () => {
    const split = dailyRevenueOfClosed(
      {
        period: periodOf("2026-10"),
        contractCode: "HD",
        lines: [
          closedRent(1, "2026-10-01", "2026-10-31", 31, 3_100_000),
          {
            lineNo: 2,
            kind: "MINIMUM",
            amount: 250_000,
            fromDate: null,
            toDate: null,
            chargedDays: 25,
            outDate: d("2026-10-21"),
            adjustmentCreatedAt: null,
          },
        ],
        freight: [{ date: d("2026-10-03"), amount: 1_000_000 }],
      },
      [],
    );
    expect(split.total).toBe(3_100_000 + 250_000 + 1_000_000);
    expect(amountOn(split, "2026-10-01")).toBe(100_000);
    expect(amountOn(split, "2026-10-21")).toBe(100_000 + 250_000);
    expect(split.mismatches).toEqual([]);
  });

  it("recounted days equal charged_days when holidays did not move", () => {
    const tet: HolidayRange = {
      name: "Tết",
      startDate: d("2027-02-05"),
      endDate: d("2027-02-13"),
    };
    const split = dailyRevenueOfClosed(
      {
        period: periodOf("2027-02"),
        contractCode: "HD",
        lines: [closedRent(1, "2027-02-01", "2027-02-28", 19, 190_000)],
        freight: [],
      },
      [tet],
    );
    expect(split.mismatches).toEqual([]);
    expect(split.days.size).toBe(19);
    expect(split.total).toBe(190_000);
  });

  it("follows charged_days and warns when a holiday differs", () => {
    const later: HolidayRange = {
      name: "Thêm sau",
      startDate: d("2026-10-05"),
      endDate: d("2026-10-05"),
    };
    const split = dailyRevenueOfClosed(
      {
        period: periodOf("2026-10"),
        contractCode: "HD",
        lines: [closedRent(3, "2026-10-01", "2026-10-10", 10, 100_000)],
        freight: [],
      },
      [later],
    );
    for (const day of datesBetween(d("2026-10-01"), d("2026-10-10"))) {
      expect(amountOn(split, day)).toBe(10_000);
    }
    expect(split.total).toBe(100_000);
    expect(split.mismatches).toEqual([
      { label: "HD kỳ 2026-10 dòng 3", recounted: 9, charged: 10 },
    ]);
  });
});

describe("splitIntoDays", () => {
  it("skips a rent line with zero quantity", () => {
    const split = splitIntoDays(
      {
        period: periodOf("2026-11"),
        lines: [
          {
            kind: "RENT",
            amount: 0,
            fromDate: d("2026-11-01"),
            toDate: d("2026-11-06"),
            chargedDays: 6,
            endDate: null,
            createdAt: null,
          },
        ],
        freight: [],
      },
      [],
    );
    expect(split.days.size).toBe(0);
    expect(split.total).toBe(0);
  });
});
