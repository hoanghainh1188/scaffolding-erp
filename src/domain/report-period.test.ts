// Periods of D15 (management-reports tasks 2.1; spec gross-profit "Kỳ báo
// cáo", spec management-reports "So với kỳ trước ở ô Doanh thu").
import { describe, expect, it } from "vitest";

import type { BusinessDate } from "./business-date";
import {
  comparableRange,
  currentMonth,
  dataUntilText,
  isRunning,
  monthsOf,
  parsePeriod,
  periodLabel,
  periodOptions,
  periodRange,
  previousPeriod,
  readPeriod,
  REPORT_FIRST_YEAR,
  switchKind,
  yearToDate,
} from "./report-period";

const d = (value: string) => value as BusinessDate;
const TODAY = d("2026-11-06");

describe("parsePeriod", () => {
  it("reads a month, a quarter and a year", () => {
    expect(parsePeriod("month", "2026-10", TODAY)).toEqual({
      kind: "month",
      value: "2026-10",
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(parsePeriod("quarter", "2026-Q3", TODAY)).toMatchObject({
      from: "2026-07-01",
      to: "2026-09-30",
    });
    expect(parsePeriod("year", "2026", TODAY)).toMatchObject({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });

  it("has a February of 28 and 29 days", () => {
    expect(parsePeriod("month", "2027-02", d("2027-03-31")).to).toBe(
      "2027-02-28",
    );
    expect(parsePeriod("month", "2028-02", d("2028-03-01")).to).toBe(
      "2028-02-29",
    );
  });

  it.each([
    ["month", "2026-13"],
    ["month", "2026-1"],
    ["week", "2026-10"],
    ["quarter", "2026-Q5"],
    ["year", "26"],
    ["month", "2019-12"],
    ["month", "2026-12"],
    ["year", "2027"],
    [undefined, undefined],
  ])("opens this month for %s %s", (kind, value) => {
    expect(readPeriod(kind, value, TODAY)).toBeNull();
    expect(parsePeriod(kind, value, TODAY)).toEqual(currentMonth(TODAY));
    expect(currentMonth(TODAY).value).toBe("2026-11");
  });

  it("offers the first month of the first year", () => {
    expect(readPeriod("month", `${REPORT_FIRST_YEAR}-01`, TODAY)?.value).toBe(
      "2020-01",
    );
  });

  it("offers the period that holds today", () => {
    expect(readPeriod("quarter", "2026-Q4", TODAY)?.value).toBe("2026-Q4");
    expect(readPeriod("year", "2026", TODAY)?.value).toBe("2026");
  });
});

describe("ranges of a period", () => {
  it("counts a running month up to today (spec: tháng đang chạy)", () => {
    const period = parsePeriod("month", "2026-11", TODAY);
    expect(periodRange(period, TODAY)).toEqual({
      from: "2026-11-01",
      to: "2026-11-06",
    });
    expect(previousPeriod(period)).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(yearToDate(period, TODAY)).toEqual({
      from: "2026-01-01",
      to: "2026-11-06",
    });
    expect(isRunning(period, TODAY)).toBe(true);
  });

  it("takes a past quarter whole (spec: quý đã qua)", () => {
    const period = parsePeriod("quarter", "2026-Q3", TODAY);
    expect(periodRange(period, TODAY).to).toBe("2026-09-30");
    expect(previousPeriod(period)).toMatchObject({
      value: "2026-Q2",
      from: "2026-04-01",
      to: "2026-06-30",
    });
    expect(yearToDate(period, TODAY)).toEqual({
      from: "2026-01-01",
      to: "2026-09-30",
    });
    expect(isRunning(period, TODAY)).toBe(false);
  });

  it("compares a year with the whole year before (spec: năm)", () => {
    const period = parsePeriod("year", "2026", TODAY);
    expect(periodRange(period, TODAY)).toEqual(yearToDate(period, TODAY));
    expect(previousPeriod(period)).toMatchObject({
      from: "2025-01-01",
      to: "2025-12-31",
    });
  });

  it("goes back across the new year", () => {
    expect(previousPeriod(parsePeriod("quarter", "2026-Q1", TODAY)).value).toBe(
      "2025-Q4",
    );
    expect(previousPeriod(parsePeriod("month", "2026-01", TODAY)).value).toBe(
      "2025-12",
    );
  });

  it("names periods", () => {
    expect(periodLabel(parsePeriod("month", "2026-10", TODAY))).toBe(
      "Tháng 10/2026",
    );
    expect(periodLabel(parsePeriod("month", "2020-01", TODAY))).toBe(
      "Tháng 01/2020",
    );
    expect(periodLabel(parsePeriod("quarter", "2026-Q3", TODAY))).toBe(
      "Quý 3/2026",
    );
    expect(periodLabel(parsePeriod("year", "2026", TODAY))).toBe("Năm 2026");
    expect(dataUntilText(parsePeriod("quarter", "2026-Q3", TODAY), TODAY)).toBe(
      "số liệu đến hết 30/09/2026",
    );
  });

  it("lists the months of a range", () => {
    expect(monthsOf({ from: d("2025-11-01"), to: d("2026-02-10") })).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });
});

describe("comparableRange (design D11)", () => {
  it("takes the whole previous month when the month has ended", () => {
    expect(
      comparableRange(parsePeriod("month", "2026-10", TODAY), TODAY),
    ).toEqual({ from: "2026-09-01", to: "2026-09-30", label: "tháng 9" });
  });

  it("takes the same first days of a running month", () => {
    expect(
      comparableRange(parsePeriod("month", "2026-11", TODAY), TODAY),
    ).toEqual({ from: "2026-10-01", to: "2026-10-06", label: "01/10 – 06/10" });
  });

  it("takes the same first days of a running year, with its year", () => {
    expect(comparableRange(parsePeriod("year", "2026", TODAY), TODAY)).toEqual({
      from: "2025-01-01",
      to: "2025-11-06",
      label: "01/01 – 06/11/2025",
    });
  });

  it("stops at the end of a shorter previous month", () => {
    const today = d("2027-03-31");
    expect(
      comparableRange(parsePeriod("month", "2027-03", today), today),
    ).toEqual({ from: "2027-02-01", to: "2027-02-28", label: "01/02 – 28/02" });
  });

  it("counts 37 days of a running quarter", () => {
    expect(
      comparableRange(parsePeriod("quarter", "2026-Q4", TODAY), TODAY),
    ).toEqual({ from: "2026-07-01", to: "2026-08-06", label: "01/07 – 06/08" });
  });

  it("names ended quarters and years", () => {
    expect(
      comparableRange(parsePeriod("quarter", "2026-Q3", TODAY), TODAY).label,
    ).toBe("quý 2/2026");
    expect(
      comparableRange(parsePeriod("year", "2025", TODAY), TODAY).label,
    ).toBe("năm 2024");
  });
});

describe("period picker", () => {
  it("switches kind around the start of the period", () => {
    const october = parsePeriod("month", "2026-10", TODAY);
    expect(switchKind(october, "quarter").value).toBe("2026-Q4");
    expect(switchKind(october, "year").value).toBe("2026");
    expect(
      switchKind(parsePeriod("quarter", "2026-Q3", TODAY), "month").value,
    ).toBe("2026-07");
  });

  it("lists the periods newest first, back to the first year", () => {
    const months = periodOptions("month", TODAY);
    expect(months[0]?.value).toBe("2026-11");
    expect(months.at(-1)?.value).toBe("2020-01");
    expect(months).toHaveLength(6 * 12 + 11);
    expect(periodOptions("quarter", TODAY)[0]?.value).toBe("2026-Q4");
    expect(periodOptions("year", TODAY).map((period) => period.value)).toEqual([
      "2026",
      "2025",
      "2024",
      "2023",
      "2022",
      "2021",
      "2020",
    ]);
  });
});
