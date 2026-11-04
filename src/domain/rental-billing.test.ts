// Rent by period (rental-billing tasks 2.3–2.6): the cases of the spec,
// computed by hand in the scenarios, and the D7 drawing of PR #139.
import { describe, expect, it } from "vitest";

import type { BusinessDate } from "./business-date";
import { DomainValueError } from "./errors";
import {
  basisPointsOf,
  buildStatement,
  formatMonth,
  nextMonth,
  periodOf,
  rateText,
  vatGroups,
  type BillingTerms,
  type FreightInput,
  type StatementAdjustment,
} from "./rental-billing";
import type { HolidayRange } from "./rental-holiday";
import { buildPieces, transferOrigins, type RentalEvent } from "./rental-lots";

const d = (value: string) => value as BusinessDate;
const ITEMS = new Map(
  [
    ["H1,7", "Khung giàn giáo 1,7m"],
    ["CHEO1,7", "Chéo giàn giáo"],
    ["KU0,5", "Kích tăng U"],
    ["MAM1,6", "Mâm giàn giáo 1,6m"],
    ["CHEO1,2", "Chéo giàn giáo 1,2m"],
  ].map(([code, name]) => [
    code as string,
    { code: code as string, name: name as string },
  ]),
);
const TET: HolidayRange = {
  name: "Tết Nguyên đán",
  startDate: d("2027-02-05"),
  endDate: d("2027-02-13"),
};

const terms = (
  number: number,
  effectiveFrom: string,
  prices: Record<string, number>,
  extra: Partial<BillingTerms> = {},
): BillingTerms => ({
  number,
  status: "APPROVED",
  effectiveFrom,
  code: number === 0 ? "HD" : `HD/0${number}`,
  minRentalDays: 45,
  paymentTermsDays: 30,
  vatBasisPoints: null,
  prices: new Map(Object.entries(prices)),
  ...extra,
});

let order = 0;
const inn = (
  code: string,
  date: string,
  pieces: number,
  item = "H1,7",
  extra: Partial<RentalEvent> = {},
): RentalEvent => ({
  itemId: item,
  direction: "IN",
  milli: pieces * 1000,
  date: d(date),
  order: ++order,
  doc: { type: "DELIVERY_NOTE", id: code, code },
  ...extra,
});
const out = (
  code: string,
  date: string,
  pieces: number,
  item = "H1,7",
  extra: Partial<RentalEvent> = {},
): RentalEvent => ({
  itemId: item,
  direction: "OUT",
  milli: pieces * 1000,
  date: d(date),
  order: ++order,
  doc: { type: "RETURN_NOTE", id: code, code },
  endKind: "RETURN",
  ...extra,
});

interface Case {
  month: string;
  events: RentalEvent[];
  revisions?: BillingTerms[];
  holidays?: HolidayRange[];
  today?: string;
  freight?: FreightInput[];
  adjustments?: StatementAdjustment[];
}

const H17 = [
  terms(0, "2026-09-01", {
    "H1,7": 1200,
    "KU0,5": 400,
    "MAM1,6": 900,
    "CHEO1,2": 280,
    "CHEO1,7": 300,
  }),
];

function statement(c: Case) {
  return buildStatement({
    period: periodOf(c.month),
    today: d(c.today ?? "2030-01-01"),
    pieces: buildPieces(c.events),
    terms: c.revisions ?? H17,
    holidays: c.holidays ?? [],
    items: ITEMS,
    freight: c.freight ?? [],
    adjustments: c.adjustments ?? [],
  });
}

/** [kind, from, to, calendar, holidays, charged, amount] of each line. */
const rows = (c: Case) =>
  statement(c).lines.map((line) => [
    line.kind,
    line.fromDate,
    line.toDate,
    line.calendarDays,
    line.holidayDays,
    line.chargedDays,
    line.amount,
  ]);

describe("periods", () => {
  it("reads a month", () => {
    expect(periodOf("2027-02")).toEqual({
      month: "2027-02",
      from: "2027-02-01",
      to: "2027-02-28",
    });
    expect(nextMonth("2026-12")).toBe("2027-01");
    expect(formatMonth("2027-02")).toBe("02/2027");
  });

  it("refuses a malformed month", () => {
    expect(() => periodOf("2027-13")).toThrow(DomainValueError);
    expect(() => periodOf("02/2027")).toThrow("Kỳ phải có dạng tháng/năm");
  });

  it("reads VAT rates", () => {
    expect(basisPointsOf("8.00", true)).toBe(800);
    expect(basisPointsOf("8.00", false)).toBeNull();
    expect(rateText(800)).toBe("8.00");
  });
});

describe("days in a period (0.2 #4)", () => {
  it("delivered before the period, still there", () => {
    expect(
      rows({ month: "2026-11", events: [inn("PX-1", "2026-10-15", 100)] }),
    ).toEqual([["RENT", "2026-11-01", "2026-11-30", 30, 0, 30, 3_600_000]]);
  });

  it("delivered in the period: from the day after", () => {
    expect(
      rows({ month: "2026-11", events: [inn("PX-1", "2026-11-10", 100)] }),
    ).toEqual([["RENT", "2026-11-11", "2026-11-30", 20, 0, 20, 2_400_000]]);
  });

  it("returned in the period: through the return day", () => {
    expect(
      rows({
        month: "2026-11",
        events: [
          inn("PX-1", "2026-09-15", 100),
          out("PTH-1", "2026-11-20", 100),
        ],
      }),
    ).toEqual([["RENT", "2026-11-01", "2026-11-20", 20, 0, 20, 2_400_000]]);
  });

  it("returned on the first day of the period", () => {
    const events = [
      inn("PX-1", "2026-10-15", 100),
      out("PTH-1", "2026-11-01", 100),
    ];
    expect(rows({ month: "2026-10", events })).toEqual([
      ["RENT", "2026-10-16", "2026-10-31", 16, 0, 16, 1_920_000],
    ]);
    expect(rows({ month: "2026-11", events })).toEqual([
      ["RENT", "2026-11-01", "2026-11-01", 1, 0, 1, 120_000],
      ["MINIMUM", null, null, null, null, 28, 3_360_000],
    ]);
  });

  it("delivered on the last day of the period", () => {
    const events = [inn("PX-1", "2026-11-30", 100)];
    expect(rows({ month: "2026-11", events })).toEqual([]);
    expect(rows({ month: "2026-12", events })[0]?.[1]).toBe("2026-12-01");
  });

  it("lost goods stop on the day of the return note", () => {
    const events = [
      inn("PX-1", "2026-09-01", 2, "KU0,5"),
      out("PTH-2026-012", "2026-11-20", 2, "KU0,5", { endKind: "LOSS" }),
    ];
    const s = statement({ month: "2026-11", events });
    expect(s.lines.map((l) => [l.out?.kind, l.chargedDays, l.amount])).toEqual([
      ["LOSS", 20, 16_000],
    ]);
    expect(rows({ month: "2026-12", events })).toEqual([]);
  });

  it("bought-back goods stop on the approval day", () => {
    const events = [
      inn("PX-1", "2026-09-01", 50, "MAM1,6"),
      out("MLA-2026-003", "2026-11-18", 50, "MAM1,6", { endKind: "BUY_BACK" }),
    ];
    const s = statement({ month: "2026-11", events });
    expect(
      s.lines.map((l) => [l.out?.kind, l.fromDate, l.toDate, l.amount]),
    ).toEqual([["BUY_BACK", "2026-11-01", "2026-11-18", 810_000]]);
  });

  it("an exchange on one day counts that day for the return only", () => {
    const events = [
      inn("PX-0", "2027-01-01", 100, "CHEO1,7"),
      inn("PX-2027-018", "2027-02-22", 100, "CHEO1,2"),
      out("PTH-1", "2027-02-22", 100, "CHEO1,7"),
    ];
    const s = statement({ month: "2027-02", events });
    expect(
      s.lines
        .filter((l) => l.kind === "RENT")
        .map((l) => [l.itemCode, l.fromDate, l.toDate]),
    ).toEqual([
      ["CHEO1,2", "2027-02-23", "2027-02-28"],
      ["CHEO1,7", "2027-02-01", "2027-02-22"],
    ]);
  });

  it("a running period stops at today, no top-up for goods still there", () => {
    const s = statement({
      month: "2026-11",
      today: "2026-11-15",
      events: [inn("PX-1", "2026-10-15", 100)],
    });
    expect(s.running).toBe(true);
    expect(s.asOf).toBe("2026-11-15");
    expect(
      s.lines.map((l) => [l.fromDate, l.toDate, l.chargedDays, l.amount]),
    ).toEqual([["2026-11-01", "2026-11-15", 15, 1_800_000]]);
  });
});

describe("holidays (0.2 #73)", () => {
  it("takes the 9 days of Tết off February", () => {
    const s = statement({
      month: "2027-02",
      events: [inn("PX-1", "2026-12-01", 100)],
      revisions: [terms(0, "2026-09-01", { "H1,7": 1400 })],
      holidays: [TET],
    });
    expect(
      s.lines.map((l) => [
        l.calendarDays,
        l.holidayDays,
        l.chargedDays,
        l.amount,
      ]),
    ).toEqual([[28, 9, 19, 2_660_000]]);
    expect(s.holidayDays).toBe(9);
  });

  it("a holiday on the delivery day is not taken off twice", () => {
    const newYear = {
      name: "Tết Dương lịch",
      startDate: d("2027-01-01"),
      endDate: d("2027-01-01"),
    };
    expect(
      rows({
        month: "2027-01",
        events: [inn("PX-1", "2027-01-01", 100)],
        holidays: [newYear],
      }),
    ).toEqual([["RENT", "2027-01-02", "2027-01-31", 30, 0, 30, 3_600_000]]);
  });

  it("a holiday on the return day is taken off", () => {
    const may = {
      name: "30/4 – 1/5",
      startDate: d("2027-04-30"),
      endDate: d("2027-05-01"),
    };
    expect(
      rows({
        month: "2027-04",
        events: [
          inn("PX-1", "2027-02-01", 100),
          out("PTH-1", "2027-04-30", 100),
        ],
        holidays: [may],
      }),
    ).toEqual([["RENT", "2027-04-01", "2027-04-30", 30, 1, 29, 3_480_000]]);
  });
});

describe("price changes by amendment (0.2 #16)", () => {
  it("splits the line on the effective day, with Tết", () => {
    const s = statement({
      month: "2027-02",
      events: [inn("PX-1", "2026-11-15", 100)],
      revisions: [
        terms(0, "2026-10-01", { "H1,7": 1200 }),
        terms(1, "2026-11-15", { "H1,7": 1400 }),
        terms(2, "2027-02-15", { "H1,7": 1300 }),
      ],
      holidays: [TET],
    });
    expect(
      s.lines.map((l) => [
        l.fromDate,
        l.toDate,
        l.calendarDays,
        l.holidayDays,
        l.chargedDays,
        l.dailyPrice,
        l.amount,
        l.revisionCode,
        l.priceChanged,
      ]),
    ).toEqual([
      ["2027-02-01", "2027-02-14", 14, 9, 5, 1400, 700_000, "HD/01", false],
      ["2027-02-15", "2027-02-28", 14, 0, 14, 1300, 1_820_000, "HD/02", true],
    ]);
  });

  it("splits without holidays", () => {
    const s = statement({
      month: "2026-12",
      events: [inn("PX-1", "2026-11-01", 600)],
      revisions: [
        terms(0, "2026-11-01", { "H1,7": 1200 }),
        terms(1, "2026-12-15", { "H1,7": 1400 }),
      ],
    });
    expect(s.lines.map((l) => [l.chargedDays, l.amount])).toEqual([
      [14, 10_080_000],
      [17, 14_280_000],
    ]);
  });

  it("does not split for an amendment that keeps the price", () => {
    const s = statement({
      month: "2026-12",
      events: [inn("PX-1", "2026-11-01", 100)],
      revisions: [
        terms(0, "2026-11-01", { "H1,7": 1200 }),
        terms(1, "2026-12-15", { "H1,7": 1200, "KU0,5": 450 }),
      ],
    });
    expect(s.lines).toHaveLength(1);
  });

  it("marks an item without a price", () => {
    const s = statement({
      month: "2026-11",
      events: [inn("PX-1", "2026-10-15", 10, "XX")],
    });
    expect(s.lines[0]?.missingPrice).toBe(true);
    expect(s.missingPrices).toEqual([""]);
  });
});

describe("minimum days per lot (0.2 #39, #74–#76)", () => {
  const amounts = (c: Case) =>
    statement(c).lines.map((l) => [l.kind, l.chargedDays, l.amount]);

  it("returned after 20 days: tops up 25 days", () => {
    expect(
      amounts({
        month: "2026-11",
        events: [
          inn("PX-1", "2026-11-05", 100),
          out("PTH-1", "2026-11-25", 100),
        ],
      }),
    ).toEqual([
      ["RENT", 20, 2_400_000],
      ["MINIMUM", 25, 3_000_000],
    ]);
  });

  it("returned on day 45: no top-up", () => {
    const events = [
      inn("PX-1", "2026-11-01", 100),
      out("PTH-1", "2026-12-16", 100),
    ];
    expect(amounts({ month: "2026-11", events })).toEqual([
      ["RENT", 29, 3_480_000],
    ]);
    expect(amounts({ month: "2026-12", events })).toEqual([
      ["RENT", 16, 1_920_000],
    ]);
  });

  it("a lot returned early over two periods (MAM1,6 of D7)", () => {
    const events = [
      inn("PX-0", "2027-01-10", 60, "MAM1,6"),
      out("PTH-1", "2027-02-04", 60, "MAM1,6"),
    ];
    expect(amounts({ month: "2027-01", events })).toEqual([
      ["RENT", 21, 1_134_000],
    ]);
    const s = statement({ month: "2027-02", events, holidays: [TET] });
    expect(
      s.lines.map((l) => [
        l.kind,
        l.chargedDays,
        l.amount,
        l.minimumDays,
        l.rentedDays,
      ]),
    ).toEqual([
      ["RENT", 4, 216_000, null, null],
      ["MINIMUM", 20, 1_080_000, 45, 25],
    ]);
    expect(s.lines[1]?.fromDate).toBeNull();
  });

  it("holidays do not count towards the minimum", () => {
    const s = statement({
      month: "2027-02",
      events: [inn("PX-1", "2027-02-01", 100), out("PTH-1", "2027-02-20", 100)],
      revisions: [terms(0, "2026-09-01", { "H1,7": 1400 })],
      holidays: [TET],
    });
    expect(
      s.lines.map((l) => [
        l.kind,
        l.calendarDays,
        l.holidayDays,
        l.chargedDays,
        l.amount,
      ]),
    ).toEqual([
      ["RENT", 19, 9, 10, 1_400_000],
      ["MINIMUM", null, null, 35, 4_900_000],
    ]);
  });

  it("a buy-back before 45 days tops up", () => {
    expect(
      amounts({
        month: "2026-11",
        events: [
          inn("PX-1", "2026-11-01", 50, "MAM1,6"),
          out("MLA-1", "2026-11-21", 50, "MAM1,6", { endKind: "BUY_BACK" }),
        ],
      }),
    ).toEqual([
      ["RENT", 20, 900_000],
      ["MINIMUM", 25, 1_125_000],
    ]);
  });

  it("only the returned part tops up", () => {
    const s = statement({
      month: "2026-11",
      events: [inn("PX-1", "2026-11-05", 100), out("PTH-1", "2026-11-25", 40)],
    });
    const minimum = s.lines.filter((l) => l.kind === "MINIMUM");
    expect(minimum.map((l) => [l.quantityMilli, l.amount])).toEqual([
      [40_000, 1_200_000],
    ]);
  });

  it("a contract minimum of 30 days", () => {
    const s = statement({
      month: "2026-11",
      events: [inn("PX-1", "2026-11-05", 100), out("PTH-1", "2026-11-25", 100)],
      revisions: [
        terms(0, "2026-09-01", { "H1,7": 1200 }, { minRentalDays: 30 }),
      ],
    });
    expect(s.lines.at(-1)?.chargedDays).toBe(10);
    expect(s.lines.at(-1)?.amount).toBe(1_200_000);
  });

  it("lost goods do not top up", () => {
    const s = statement({
      month: "2027-02",
      events: [
        inn("PX-1", "2027-02-01", 2, "KU0,5"),
        out("PTH-1", "2027-02-20", 2, "KU0,5", { endKind: "LOSS" }),
      ],
    });
    expect(s.lines.map((l) => [l.kind, l.chargedDays, l.amount])).toEqual([
      ["RENT", 19, 15_200],
    ]);
  });

  it("scrap returned to the yard still tops up", () => {
    expect(
      amounts({
        month: "2026-11",
        events: [inn("PX-1", "2026-11-05", 10), out("PTH-1", "2026-11-25", 10)],
      }),
    ).toEqual([
      ["RENT", 20, 240_000],
      ["MINIMUM", 25, 300_000],
    ]);
  });

  it("delivered and returned on one day: no rent, no top-up", () => {
    expect(
      amounts({
        month: "2026-11",
        events: [
          inn("PX-2026-020", "2026-11-10", 50, "CHEO1,2"),
          out("PTH-1", "2026-11-10", 50, "CHEO1,2"),
        ],
      }),
    ).toEqual([]);
  });

  it("tops up at the price on the return day", () => {
    const s = statement({
      month: "2026-11",
      events: [inn("PX-1", "2026-11-05", 100), out("PTH-1", "2026-11-25", 100)],
      revisions: [
        terms(0, "2026-09-01", { "H1,7": 1200 }),
        terms(1, "2026-11-20", { "H1,7": 1000 }),
      ],
    });
    expect(s.lines.at(-1)).toMatchObject({
      kind: "MINIMUM",
      dailyPrice: 1000,
      amount: 2_500_000,
    });
  });
});

describe("site transfers and the minimum (0.2 #70)", () => {
  const A = [terms(0, "2026-09-01", { "H1,7": 1200 })];
  const B = [terms(0, "2026-09-01", { "H1,7": 1300 })];

  function chain(sameCustomer: boolean) {
    const source = buildPieces([
      inn("PX-1", "2026-11-01", 100),
      out("CCT-1", "2026-11-11", 100, "H1,7", {
        endKind: "TRANSFER",
        sameCustomer,
        doc: { type: "SITE_TRANSFER", id: "CCT-1", code: "CCT-1" },
      }),
    ]);
    const target = [
      inn("CCT-1", "2026-11-11", 100, "H1,7", {
        sameCustomer,
        origins: transferOrigins(source, "CCT-1", "H1,7"),
        doc: { type: "SITE_TRANSFER", id: "CCT-1", code: "CCT-1" },
      }),
      out("PTH-1", "2026-11-26", 100),
    ];
    const sourceEvents = [
      inn("PX-1", "2026-11-01", 100),
      out("CCT-1", "2026-11-11", 100, "H1,7", {
        endKind: "TRANSFER",
        sameCustomer,
        doc: { type: "SITE_TRANSFER", id: "CCT-1", code: "CCT-1" },
      }),
    ];
    const pick = (events: RentalEvent[], revisions: BillingTerms[]) =>
      statement({ month: "2026-11", events, revisions }).lines.map((l) => [
        l.kind,
        l.chargedDays,
        l.amount,
      ]);
    return { a: pick(sourceEvents, A), b: pick(target, B) };
  }

  it("same customer: no top-up at the source, the chain counts at the target", () => {
    expect(chain(true)).toEqual({
      a: [["RENT", 10, 1_200_000]],
      b: [
        ["RENT", 15, 1_950_000],
        ["MINIMUM", 20, 2_600_000],
      ],
    });
  });

  it("another customer: each contract applies its own minimum", () => {
    expect(chain(false)).toEqual({
      a: [
        ["RENT", 10, 1_200_000],
        ["MINIMUM", 35, 4_200_000],
      ],
      b: [
        ["RENT", 15, 1_950_000],
        ["MINIMUM", 30, 3_900_000],
      ],
    });
  });

  it("same customer after 45 days: no top-up anywhere", () => {
    const source = buildPieces([
      inn("PX-1", "2026-10-01", 100),
      out("CCT-2", "2026-11-20", 100, "H1,7", {
        endKind: "TRANSFER",
        sameCustomer: true,
        doc: { type: "SITE_TRANSFER", id: "CCT-2", code: "CCT-2" },
      }),
    ]);
    const s = statement({
      month: "2026-11",
      revisions: B,
      events: [
        inn("CCT-2", "2026-11-20", 100, "H1,7", {
          sameCustomer: true,
          origins: transferOrigins(source, "CCT-2", "H1,7"),
        }),
        out("PTH-2", "2026-11-25", 100),
      ],
    });
    expect(s.lines.map((l) => l.kind)).toEqual(["RENT"]);
  });
});

describe("statement totals (0.2 #18, #78, #79)", () => {
  const adjustment = (amount: number): StatementAdjustment => ({
    id: "adj-1",
    refMonth: "2027-01",
    amount,
    reason: "Kỳ 01 thiếu 10 CHEO1,7 × 31 ngày (giao 31/12 chưa ghi)",
    createdByName: "Thu Hà",
    createdAt: new Date("2027-03-02T02:00:00Z"),
    updatedAt: new Date("2027-03-02T02:00:00Z"),
  });

  it("matches the D7 drawing for 02/2027: 7.283.304 ₫", () => {
    const vat = { vatBasisPoints: 800 };
    const prices = {
      "CHEO1,7": 300,
      "KU0,5": 400,
      "MAM1,6": 900,
      "CHEO1,2": 280,
    };
    const s = statement({
      month: "2027-02",
      today: "2027-03-02",
      holidays: [TET],
      revisions: [
        terms(0, "2026-10-01", { "H1,7": 1200, ...prices }, vat),
        terms(1, "2026-11-15", { "H1,7": 1400, ...prices }, vat),
        terms(2, "2027-02-15", { "H1,7": 1300, ...prices }, vat),
      ],
      events: [
        inn("PX-2026-031", "2026-11-15", 100),
        inn("PX-2026-031", "2026-11-15", 260, "CHEO1,7"),
        inn("PX-2026-031", "2026-11-15", 2, "KU0,5"),
        inn("PX-2027-003", "2027-01-10", 60, "MAM1,6"),
        out("PTH-2027-004", "2027-02-04", 60, "MAM1,6"),
        out("PTH-2027-012", "2027-02-20", 260, "CHEO1,7"),
        out("PTH-2027-012", "2027-02-20", 2, "KU0,5", { endKind: "LOSS" }),
        inn("PX-2027-018", "2027-02-22", 100, "CHEO1,2"),
      ],
      freight: [
        {
          deliveryNoteId: "px18",
          code: "PX-2027-018",
          batchNo: 5,
          vehiclePlate: "51X-000.02",
          date: d("2027-02-22"),
          amount: 1_800_000,
        },
        {
          deliveryNoteId: "px3",
          code: "PX-2027-003",
          batchNo: 3,
          vehiclePlate: null,
          date: d("2027-01-10"),
          amount: 900_000,
        },
      ],
      adjustments: [adjustment(93_000)],
    });
    expect(s.lines.map((l) => [l.itemCode ?? "ĐC", l.kind, l.amount])).toEqual([
      ["CHEO1,2", "RENT", 168_000],
      ["CHEO1,7", "RENT", 858_000],
      ["H1,7", "RENT", 700_000],
      ["H1,7", "RENT", 1_820_000],
      ["KU0,5", "RENT", 8_800],
      ["MAM1,6", "RENT", 216_000],
      ["MAM1,6", "MINIMUM", 1_080_000],
      ["ĐC", "ADJUSTMENT", 93_000],
    ]);
    expect(s.rentAmount).toBe(4_850_800);
    expect(s.adjustmentAmount).toBe(93_000);
    expect(s.freightAmount).toBe(1_800_000);
    expect(s.beforeVat).toBe(6_743_800);
    expect(s.vat).toEqual([
      { basisPoints: 800, base: 6_743_800, amount: 539_504 },
    ]);
    expect(s.totalAmount).toBe(7_283_304);
    expect(s.dueDate).toBe("2027-03-30");
    expect(s.running).toBe(false);
  });

  it("no VAT without an invoice", () => {
    const s = statement({
      month: "2026-11",
      events: [inn("PX-1", "2026-11-10", 100)],
      freight: [
        {
          deliveryNoteId: "px1",
          code: "PX-1",
          batchNo: 1,
          vehiclePlate: null,
          date: d("2026-11-10"),
          amount: 900_000,
        },
      ],
    });
    expect(s.vatAmount).toBe(0);
    expect(s.totalAmount).toBe(3_300_000);
  });

  it("VAT changing from 8 % to 10 % in the period", () => {
    const s = statement({
      month: "2027-02",
      events: [inn("PX-1", "2027-01-01", 100)],
      revisions: [
        terms(0, "2026-09-01", { "H1,7": 1000 }, { vatBasisPoints: 800 }),
        terms(1, "2027-02-15", { "H1,7": 1000 }, { vatBasisPoints: 1000 }),
      ],
    });
    expect(s.lines.map((l) => [l.amount, l.vatBasisPoints])).toEqual([
      [1_400_000, 800],
      [1_400_000, 1000],
    ]);
    expect(s.vat.map((g) => g.amount)).toEqual([112_000, 140_000]);
  });

  it("VAT turned off in the period", () => {
    const s = statement({
      month: "2027-02",
      events: [inn("PX-1", "2027-01-01", 100)],
      revisions: [
        terms(0, "2026-09-01", { "H1,7": 1000 }, { vatBasisPoints: 800 }),
        terms(1, "2027-02-15", { "H1,7": 1000 }),
      ],
    });
    expect(s.vatAmount).toBe(112_000);
  });

  it("rounds VAT half up on the total of a rate", () => {
    expect(
      vatGroups([{ amount: 1_234_567, vatBasisPoints: 800 }])[0]?.amount,
    ).toBe(98_765);
    expect(
      vatGroups([
        { amount: 1_000_000, vatBasisPoints: 800 },
        { amount: 1_000_000, vatBasisPoints: 1000 },
      ]).map((g) => g.amount),
    ).toEqual([80_000, 100_000]);
  });

  it("a negative adjustment lowers the total", () => {
    const s = statement({
      month: "2027-02",
      events: [inn("PX-1", "2027-01-01", 100)],
      adjustments: [adjustment(-50_000)],
    });
    expect(s.adjustmentAmount).toBe(-50_000);
    expect(s.totalAmount).toBe(3_360_000 - 50_000);
  });
});
