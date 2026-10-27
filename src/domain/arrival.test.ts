import { describe, expect, it } from "vitest";

import { arrivalLabel, isDueToday } from "./arrival";
import { addDays, daysBetween, type BusinessDate } from "./business-date";

const d = (value: string) => value as BusinessDate;
const TODAY = d("2026-10-26");

describe("addDays and daysBetween", () => {
  it("moves across months and years", () => {
    expect(addDays(d("2026-10-31"), 1)).toBe("2026-11-01");
    expect(addDays(d("2027-01-01"), -1)).toBe("2026-12-31");
    expect(daysBetween(d("2026-10-24"), TODAY)).toBe(2);
    expect(daysBetween(TODAY, d("2026-10-24"))).toBe(-2);
  });
});

describe("arrivalLabel", () => {
  it("says how late a truck is", () => {
    expect(arrivalLabel(d("2026-10-24"), null, TODAY)).toEqual({
      day: "LATE",
      text: "Trễ 2 ngày",
    });
  });

  it("shows the time for today and tomorrow", () => {
    expect(arrivalLabel(TODAY, "09:30:00", TODAY)).toEqual({
      day: "TODAY",
      text: "09:30",
    });
    expect(arrivalLabel(TODAY, null, TODAY).text).toBe("Hôm nay");
    expect(arrivalLabel(d("2026-10-27"), "14:00", TODAY).text).toBe(
      "Mai 14:00",
    );
    expect(arrivalLabel(d("2026-10-27"), null, TODAY).text).toBe("Mai");
  });

  it("shows the date further ahead", () => {
    expect(arrivalLabel(d("2026-10-28"), "08:00", TODAY)).toEqual({
      day: "LATER",
      text: "28/10/2026",
    });
  });

  it("counts late and today as today's work", () => {
    expect(isDueToday("LATE")).toBe(true);
    expect(isDueToday("TODAY")).toBe(true);
    expect(isDueToday("TOMORROW")).toBe(false);
  });
});
