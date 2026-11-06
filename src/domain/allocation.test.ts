// payables task 2.1: the core shared by receivables and payables. Debts come
// in already ordered; messages and errors come from the caller.
import { describe, expect, it } from "vitest";

import {
  allocateOrdered,
  applyCreditsOrdered,
  dueSoonOf,
  dueStatus,
  holderStatus,
  orderSources,
  overdueOf,
  type AllocationMessages,
  type OpenItem,
} from "./allocation";
import type { BusinessDate } from "./business-date";
import { toMoney } from "./money";

const d = (value: string) => value as BusinessDate;
const m = (value: number) => toMoney(value);

class RuleError extends Error {
  constructor(
    message: string,
    readonly status: 409 | 422,
  ) {
    super(message);
  }
}

const messages: AllocationMessages = {
  amount: "amount",
  unknownDebt: "unknown",
  manualTooMuch: (amount) => `too much ${amount}`,
  overDebt: (label, remaining) => `${label} left ${remaining}`,
};

const item = (key: string, remaining: number): OpenItem => ({
  key,
  remaining: m(remaining),
  label: key,
});

function split(
  amount: number,
  debts: OpenItem[],
  extra: Partial<Parameters<typeof allocateOrdered>[0]> = {},
) {
  return allocateOrdered({
    amount: m(amount),
    debts,
    messages,
    fail: (message, status) => new RuleError(message, status),
    ...extra,
  });
}

function failure(run: () => unknown): RuleError {
  try {
    run();
  } catch (error) {
    if (error instanceof RuleError) return error;
    throw error;
  }
  throw new Error("expected a rule error");
}

describe("allocateOrdered", () => {
  it("takes the debts in the order given, then leaves the rest", () => {
    const result = split(10, [item("B", 4), item("A", 3)]);
    expect(result.allocations).toEqual([
      { debtKey: "B", amount: 4, mode: "AUTO" },
      { debtKey: "A", amount: 3, mode: "AUTO" },
    ]);
    expect(result.unapplied).toBe(3);
  });

  it("takes named parts first and skips settled debts", () => {
    const result = split(6, [item("A", 0), item("B", 5), item("C", 5)], {
      manual: [{ debtKey: "C", amount: m(4) }],
    });
    expect(result.allocations).toEqual([
      { debtKey: "C", amount: 4, mode: "MANUAL" },
      { debtKey: "B", amount: 2, mode: "AUTO" },
    ]);
    expect(result.unapplied).toBe(0);
  });

  it("refuses with the caller's messages and status", () => {
    expect(failure(() => split(0, [])).message).toBe("amount");
    expect(
      failure(() =>
        split(3, [item("A", 5)], { manual: [{ debtKey: "A", amount: m(4) }] }),
      ).message,
    ).toBe("too much 3");
    expect(
      failure(() =>
        split(3, [item("A", 5)], { manual: [{ debtKey: "Z", amount: m(1) }] }),
      ).message,
    ).toBe("unknown");
    const over = failure(() =>
      split(9, [item("A", 5)], { manual: [{ debtKey: "A", amount: m(6) }] }),
    );
    expect([over.message, over.status]).toEqual(["A left 5", 422]);
  });

  it("tells a race (409) from a mistake when the form saw enough", () => {
    const raced = failure(() =>
      split(6, [item("A", 0)], {
        manual: [{ debtKey: "A", amount: m(6) }],
        seen: new Map([["A", m(6)]]),
      }),
    );
    expect([raced.message, raced.status]).toEqual(["A left 0", 409]);
  });
});

describe("applyCreditsOrdered", () => {
  it("uses older sources first over the debts in order", () => {
    const rows = applyCreditsOrdered({
      credits: [
        { key: "new", date: d("2026-11-05"), code: "PC-2", available: m(5) },
        { key: "old", date: d("2026-11-01"), code: "PC-1", available: m(3) },
      ],
      debts: [item("X", 4), item("Y", 0), item("Z", 10)],
    });
    expect(rows).toEqual([
      { sourceKey: "old", debtKey: "X", amount: 3 },
      { sourceKey: "new", debtKey: "X", amount: 1 },
      { sourceKey: "new", debtKey: "Z", amount: 4 },
    ]);
  });

  it("orders sources by date, then code", () => {
    const sources = orderSources([
      { date: d("2026-11-02"), code: "B" },
      { date: d("2026-11-02"), code: "A" },
      { date: d("2026-11-01"), code: "C" },
    ]);
    expect(sources.map((source) => source.code)).toEqual(["C", "A", "B"]);
  });
});

describe("dueStatus", () => {
  const today = d("2026-11-06");
  it.each([
    [0, "2026-11-01", "PAID", "Đã trả đủ"],
    [5, "2026-11-04", "OVERDUE", "Quá hạn 2 ngày"],
    [5, "2026-11-06", "DUE_TODAY", "Hạn hôm nay"],
    [5, "2026-11-07", "DUE_TOMORROW", "Hạn mai"],
    [5, "2026-11-20", "NOT_DUE", "Chưa đến hạn"],
  ])("%i ₫ due %s → %s", (remaining, due, kind, label) => {
    const status = dueStatus(remaining, d(due), today, "Đã trả đủ");
    expect([status.kind, status.label]).toEqual([kind, label]);
  });
});

describe("overdue and due soon", () => {
  const today = d("2026-11-06");
  const debts = [
    { remaining: m(26_500_000), dueDate: d("2026-11-04") },
    { remaining: m(16_250_000), dueDate: d("2026-11-05") },
    { remaining: m(52_500_000), dueDate: d("2026-11-13") },
    { remaining: m(1_000_000), dueDate: d("2026-11-14") },
    { remaining: m(0), dueDate: d("2026-10-01") },
  ];
  it("sums what is past due, days from the earliest", () => {
    expect(overdueOf(debts, today)).toEqual({ amount: 42_750_000, days: 2 });
  });
  it("counts today to today + 7", () => {
    expect(dueSoonOf(debts, today)).toBe(52_500_000);
  });
});

describe("holderStatus", () => {
  const today = d("2026-11-06");
  const status = (dueDate: string, remaining = 5, credit = 0) =>
    holderStatus({
      debts: [{ remaining: m(remaining), dueDate: d(dueDate) }],
      credit: m(credit),
      today,
      creditLabel: "Đã ứng trước",
    }).label;

  it("shows the due date only within 7 days (0.2 #104)", () => {
    expect(status("2026-11-13")).toBe("Hạn 13/11");
    expect(status("2026-11-14")).toBe("Chưa đến hạn");
    expect(status("2026-11-20")).toBe("Chưa đến hạn");
  });

  it("puts overdue first, then credit, then clear", () => {
    expect(status("2026-11-01")).toBe("Quá hạn 5 ngày");
    expect(status("2026-11-01", 0, 10)).toBe("Đã ứng trước");
    expect(status("2026-11-01", 0, 0)).toBe("Hết nợ");
  });
});
