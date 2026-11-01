import { describe, expect, it } from "vitest";

import type { Condition } from "./condition";
import { toMoney } from "./money";
import {
  adjustDeviceTime,
  assertCountableLocation,
  assertSubmission,
  differenceValue,
  flagLabel,
  isCountableLocation,
  lineDifference,
  STOCKTAKE_MESSAGES,
  stocktakeAdjustmentLines,
  stocktakeFlags,
  stocktakeMovements,
  stocktakeSummary,
  StocktakeFieldError,
  type FlagInput,
  type SessionLine,
  type SubmittedItem,
  type SummaryLine,
} from "./stocktake";

const K = 1000;
const at = (time: string) => new Date(`2026-10-28T${time}:00+07:00`);

describe("countable places", () => {
  it("counts yards and workshops, refuses sites", () => {
    expect(isCountableLocation("YARD")).toBe(true);
    expect(isCountableLocation("WORKSHOP")).toBe(true);
    expect(isCountableLocation("SITE")).toBe(false);
    expect(() => assertCountableLocation("SITE")).toThrow(
      STOCKTAKE_MESSAGES.siteRefused,
    );
    expect(() => assertCountableLocation("YARD")).not.toThrow();
  });
});

describe("adjustDeviceTime", () => {
  const startedAt = at("08:00");

  it("moves a slow phone clock by its offset", () => {
    expect(
      adjustDeviceTime({
        at: at("09:07"),
        deviceNow: at("11:35"),
        serverNow: at("11:40"),
        startedAt,
      }),
    ).toEqual(at("09:12"));
  });

  it("moves a fast phone clock back", () => {
    expect(
      adjustDeviceTime({
        at: at("09:14"),
        deviceNow: at("11:42"),
        serverNow: at("11:40"),
        startedAt,
      }),
    ).toEqual(at("09:12"));
  });

  it("keeps the time inside the session", () => {
    expect(
      adjustDeviceTime({
        at: new Date("2026-10-27T09:00:00+07:00"),
        deviceNow: at("11:40"),
        serverNow: at("11:40"),
        startedAt,
      }),
    ).toEqual(startedAt);
    expect(
      adjustDeviceTime({
        at: at("12:30"),
        deviceNow: at("11:40"),
        serverNow: at("11:40"),
        startedAt,
      }),
    ).toEqual(at("11:40"));
  });
});

const D13_LINES = [
  { code: "GG-CH", condition: "GOOD", book: 2480, counted: 2450 },
  { code: "GG-CH", condition: "NEEDS_REPAIR", book: 40, counted: 50 },
  { code: "GG-K15", condition: "GOOD", book: 860, counted: 852 },
  { code: "GG-K17", condition: "GOOD", book: 1230, counted: 1226 },
  { code: "PK-KU", condition: "GOOD", book: 500, counted: 502 },
] as const;

describe("adjustment lines", () => {
  const posting = D13_LINES.map((line) => ({
    itemId: line.code,
    condition: line.condition as Condition,
    countedMilli: line.counted * K,
    bookMilli: line.book * K,
    unitCost: null,
  }));

  it("turns the D13 differences into the right ledger lines", () => {
    const drafts = stocktakeMovements("KK-2026-003", "BAI-01", "yard", [
      ...posting,
      {
        itemId: "GG-M16",
        condition: "GOOD",
        countedMilli: 300 * K,
        bookMilli: 300 * K,
        unitCost: null,
      },
      {
        itemId: "GG-M16",
        condition: "NEEDS_REPAIR",
        countedMilli: null,
        bookMilli: null,
        unitCost: null,
      },
    ]);
    expect(
      drafts.map((d) => [d.itemId, d.condition, d.movement, d.quantityMilli]),
    ).toEqual([
      ["GG-CH", "GOOD", "ADJUST_OUT", -30 * K],
      ["GG-CH", "NEEDS_REPAIR", "ADJUST_IN", 10 * K],
      ["GG-K15", "GOOD", "ADJUST_OUT", -8 * K],
      ["GG-K17", "GOOD", "ADJUST_OUT", -4 * K],
      ["PK-KU", "GOOD", "ADJUST_IN", 2 * K],
    ]);
    expect(drafts.every((d) => d.locationId === "yard")).toBe(true);
    expect(drafts.every((d) => d.amount === undefined)).toBe(true);
    expect(drafts[0]?.description).toBe("KK-2026-003: Kiểm kê BAI-01");
  });

  it("writes nothing when every line matches or is not counted", () => {
    expect(
      stocktakeMovements("KK-2026-002", "XUONG-01", "ws", [
        {
          itemId: "GG-K17",
          condition: "GOOD",
          countedMilli: 9 * K,
          bookMilli: 9 * K,
          unitCost: null,
        },
        {
          itemId: "GG-CH",
          condition: "GOOD",
          countedMilli: null,
          bookMilli: null,
          unitCost: null,
        },
      ]),
    ).toEqual([]);
  });

  it("keeps kg differences and a unit cost the director typed", () => {
    const lines = stocktakeAdjustmentLines("yard", [
      {
        itemId: "PL-SAT",
        condition: "SCRAP",
        countedMilli: 1_248_250,
        bookMilli: 1_250_500,
        unitCost: null,
      },
      {
        itemId: "GG-K12",
        condition: "NEW",
        countedMilli: 5 * K,
        bookMilli: 0,
        unitCost: 150_000,
      },
    ]);
    expect(lines.map((l) => [l.quantityMilli, l.unitCost])).toEqual([
      [-2_250, null],
      [5 * K, 150_000],
    ]);
    expect(lines.every((l) => l.lineType === "QUANTITY")).toBe(true);
    const drafts = stocktakeMovements("KK-2026-004", "BAI-01", "yard", [
      {
        itemId: "GG-K12",
        condition: "NEW",
        countedMilli: 5 * K,
        bookMilli: 0,
        unitCost: 150_000,
      },
    ]);
    expect(drafts[0]?.unitCost).toBe(150_000);
  });

  it("is right when stock moved after the count (design D2)", () => {
    const book = 1_230 * K;
    const counted = 1_226 * K;
    const afterCount = -100 * K;
    const difference = lineDifference(counted, book);
    expect(difference).toBe(-4 * K);
    expect(book + afterCount + difference).toBe(counted + afterCount);
    expect(book + afterCount + difference).toBe(1_126 * K);
  });
});

function flagsOf(lines: Partial<FlagInput>[]) {
  return stocktakeFlags(
    lines.map((line) => ({
      itemId: "X",
      countedMilli: null,
      bookMilli: null,
      moved: false,
      ...line,
    })),
  );
}

describe("stocktakeFlags", () => {
  it("flags more than 1 % off the book", () => {
    expect(
      flagsOf([
        { itemId: "GG-CH", countedMilli: 2450 * K, bookMilli: 2480 * K },
        { itemId: "GG-K15", countedMilli: 852 * K, bookMilli: 860 * K },
        { itemId: "A", countedMilli: 990 * K, bookMilli: 1000 * K },
        { itemId: "B", countedMilli: 6 * K, bookMilli: 0 },
        { itemId: "C", countedMilli: 0, bookMilli: 0 },
      ]),
    ).toEqual([["OVER_PCT"], [], [], ["OVER_PCT"], []]);
    expect(
      flagLabel("OVER_PCT", { countedMilli: 2450 * K, bookMilli: 2480 * K }),
    ).toBe("Lệch 1,2 %");
    expect(flagLabel("OVER_PCT", { countedMilli: 6 * K, bookMilli: 0 })).toBe(
      "Sổ 0, đếm được 6",
    );
  });

  it("flags a shortage and a surplus of one item as a condition mix-up", () => {
    expect(
      flagsOf([
        { itemId: "GG-CH", countedMilli: 2450 * K, bookMilli: 2480 * K },
        { itemId: "GG-CH", countedMilli: 50 * K, bookMilli: 40 * K },
        { itemId: "GG-K17", countedMilli: 1226 * K, bookMilli: 1230 * K },
        { itemId: "GG-K17", countedMilli: 186 * K, bookMilli: 186 * K },
      ]),
    ).toEqual([
      ["OVER_PCT", "CONDITION_SWAP"],
      ["OVER_PCT", "CONDITION_SWAP"],
      [],
      [],
    ]);
    expect(flagLabel("CONDITION_SWAP", { countedMilli: 0, bookMilli: 0 })).toBe(
      "Nghi nhầm tình trạng",
    );
  });

  it("flags stock that moved while the item was counted", () => {
    expect(
      flagsOf([
        {
          itemId: "PK-KU",
          countedMilli: 502 * K,
          bookMilli: 500 * K,
          moved: true,
        },
        { itemId: "GG-M16", countedMilli: 300 * K, bookMilli: 300 * K },
        { itemId: "GG-K12", moved: true },
      ]),
    ).toEqual([["MOVED"], [], []]);
    expect(flagLabel("MOVED", { countedMilli: 0, bookMilli: 0 })).toBe(
      "Có nhập/xuất trong lúc đếm",
    );
  });
});

describe("stocktakeSummary", () => {
  const costs = [31_000, 18_000, 167_116, 195_282, 40_000];
  const flags = [
    ["OVER_PCT", "CONDITION_SWAP"],
    ["OVER_PCT", "CONDITION_SWAP"],
    [],
    [],
    ["MOVED"],
  ] as const;
  const off: SummaryLine[] = D13_LINES.map((line, index) => ({
    unit: "PIECE",
    countedMilli: line.counted * K,
    bookMilli: line.book * K,
    unitCost: toMoney(costs[index] ?? 0),
    flags: flags[index] ?? [],
  }));
  const matched: SummaryLine[] = Array.from({ length: 23 }, () => ({
    unit: "PIECE",
    countedMilli: 10 * K,
    bookMilli: 10 * K,
    unitCost: toMoney(1_000),
    flags: [],
  }));

  it("adds up the D13 tiles", () => {
    const summary = stocktakeSummary([...off, ...matched]);
    expect(summary.shortage).toEqual({
      lines: 3,
      quantity: { PIECE: -42 * K, KG: 0 },
      value: -3_048_056,
    });
    expect(summary.surplus).toEqual({
      lines: 2,
      quantity: { PIECE: 12 * K, KG: 0 },
      value: 260_000,
    });
    expect(summary.matched).toBe(23);
    expect(summary.flagged).toBe(3);
    expect(summary.value).toBe(-2_788_056);
    expect(summary.counted).toBe(28);
    expect(summary.total).toBe(28);
  });

  it("is all zero when nothing is counted", () => {
    const summary = stocktakeSummary([
      {
        unit: "PIECE",
        countedMilli: null,
        bookMilli: null,
        unitCost: null,
        flags: [],
      },
    ]);
    expect(summary).toMatchObject({
      counted: 0,
      total: 1,
      matched: 0,
      flagged: 0,
      value: 0,
    });
    expect(summary.shortage.lines).toBe(0);
  });

  it("leaves a line without a cost out of the value", () => {
    const line: SummaryLine = {
      unit: "PIECE",
      countedMilli: 5 * K,
      bookMilli: 0,
      unitCost: null,
      flags: ["OVER_PCT"],
    };
    expect(differenceValue(line)).toBeNull();
    const summary = stocktakeSummary([line, ...off]);
    expect(summary.surplus.lines).toBe(3);
    expect(summary.surplus.value).toBe(260_000);
    expect(summary.value).toBe(-2_788_056);
  });
});

describe("assertSubmission", () => {
  const session: SessionLine[] = [
    { itemId: "ch", condition: "GOOD", counted: false, recount: false },
    { itemId: "ch", condition: "NEEDS_REPAIR", counted: false, recount: false },
    { itemId: "k17", condition: "GOOD", counted: false, recount: false },
  ];
  const ch = (lines: SubmittedItem["lines"]): SubmittedItem => ({
    itemId: "ch",
    itemCode: "GG-CH",
    unit: "PIECE",
    lines,
  });
  const k17 = (quantityMilli: number): SubmittedItem => ({
    itemId: "k17",
    itemCode: "GG-K17",
    unit: "PIECE",
    lines: [{ condition: "GOOD", quantityMilli }],
  });

  function failure(run: () => void): { message: string; field?: string } {
    try {
      run();
    } catch (error) {
      return {
        message: (error as Error).message,
        field: error instanceof StocktakeFieldError ? error.field : undefined,
      };
    }
    return { message: "none" };
  }

  it("needs a number for every condition of a sent item", () => {
    expect(
      failure(() =>
        assertSubmission(session, [
          ch([{ condition: "GOOD", quantityMilli: 2450 * K }]),
        ]),
      ),
    ).toEqual({
      message: STOCKTAKE_MESSAGES.missingCondition("NEEDS_REPAIR"),
      field: "items.0",
    });
    expect(
      failure(() =>
        assertSubmission(session, [
          ch([
            { condition: "GOOD", quantityMilli: 2450 * K },
            { condition: "NEEDS_REPAIR", quantityMilli: 0 },
          ]),
        ]),
      ).message,
    ).toBe("none");
  });

  it("refuses part pieces, negatives and repeats", () => {
    expect(failure(() => assertSubmission(session, [k17(12_500)]))).toEqual({
      message: STOCKTAKE_MESSAGES.wholePieces("GG-K17"),
      field: "items.0.lines.0.quantity",
    });
    expect(failure(() => assertSubmission(session, [k17(-K)])).message).toBe(
      STOCKTAKE_MESSAGES.negative("GG-K17"),
    );
    expect(
      failure(() => assertSubmission(session, [k17(K), k17(2 * K)])).message,
    ).toBe(STOCKTAKE_MESSAGES.duplicateItem("GG-K17"));
    expect(
      failure(() =>
        assertSubmission(session, [
          ch([
            { condition: "GOOD", quantityMilli: K },
            { condition: "GOOD", quantityMilli: K },
          ]),
        ]),
      ).message,
    ).toBe(STOCKTAKE_MESSAGES.duplicateCondition("GG-CH", "GOOD"));
    expect(failure(() => assertSubmission(session, [ch([])])).message).toBe(
      STOCKTAKE_MESSAGES.noLines("GG-CH"),
    );
  });

  it("needs at least one counted item", () => {
    expect(failure(() => assertSubmission(session, [])).message).toBe(
      STOCKTAKE_MESSAGES.nothingCounted,
    );
    const returned = session.map((line) => ({ ...line, counted: true }));
    expect(failure(() => assertSubmission(returned, [])).message).toBe("none");
  });

  it("takes added lines and kg decimals", () => {
    expect(
      failure(() =>
        assertSubmission(session, [
          ch([
            { condition: "GOOD", quantityMilli: 2450 * K },
            { condition: "NEEDS_REPAIR", quantityMilli: 50 * K },
            { condition: "SCRAP", quantityMilli: 6 * K },
          ]),
          {
            itemId: "sat",
            itemCode: "PL-SAT",
            unit: "KG",
            lines: [{ condition: "SCRAP", quantityMilli: 1_248_250 }],
          },
        ]),
      ).message,
    ).toBe("none");
  });

  it("takes only the lines asked for in a recount round", () => {
    const recount: SessionLine[] = [
      { itemId: "ch", condition: "GOOD", counted: true, recount: false },
      {
        itemId: "ch",
        condition: "NEEDS_REPAIR",
        counted: false,
        recount: true,
      },
      { itemId: "k17", condition: "GOOD", counted: true, recount: false },
    ];
    expect(
      failure(() =>
        assertSubmission(recount, [
          ch([{ condition: "NEEDS_REPAIR", quantityMilli: 42 * K }]),
        ]),
      ).message,
    ).toBe("none");
    expect(failure(() => assertSubmission(recount, [k17(K)]))).toEqual({
      message: STOCKTAKE_MESSAGES.noRecount("GG-K17"),
      field: "items.0.lines.0.quantity",
    });
    expect(
      failure(() =>
        assertSubmission(recount, [
          ch([{ condition: "GOOD", quantityMilli: K }]),
        ]),
      ).message,
    ).toBe(STOCKTAKE_MESSAGES.noRecount("GG-CH"));
    expect(failure(() => assertSubmission(recount, []))).toEqual({
      message: STOCKTAKE_MESSAGES.recountMissing(1),
      field: "items",
    });
    expect(
      failure(() =>
        assertSubmission(recount, [
          ch([{ condition: "NEEDS_REPAIR", quantityMilli: 42 * K }]),
          {
            itemId: "new",
            itemCode: "PK-KU",
            unit: "PIECE",
            lines: [{ condition: "GOOD", quantityMilli: 12 * K }],
          },
        ]),
      ).message,
    ).toBe("none");
  });
});
