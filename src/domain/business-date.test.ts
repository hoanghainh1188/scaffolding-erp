import { describe, expect, it } from "vitest";

import {
  formatBusinessDate,
  monthRange,
  formatDateTime,
  isBusinessDate,
  toBusinessDate,
} from "./business-date";

describe("toBusinessDate", () => {
  it("uses the Vietnam calendar day at midnight local time", () => {
    expect(toBusinessDate(new Date("2026-10-26T17:00:00Z"))).toBe("2026-10-27");
  });

  it("keeps the previous day one second before midnight", () => {
    expect(toBusinessDate(new Date("2026-10-26T16:59:59Z"))).toBe("2026-10-26");
  });

  it("crosses the year boundary", () => {
    expect(toBusinessDate(new Date("2026-12-31T17:30:00Z"))).toBe("2027-01-01");
  });

  it("rejects an invalid date", () => {
    expect(() => toBusinessDate(new Date("nope"))).toThrow(
      "Thời điểm không hợp lệ",
    );
  });
});

describe("formatting", () => {
  it("shows a business date as dd/MM/yyyy", () => {
    expect(formatBusinessDate("2026-10-27")).toBe("27/10/2026");
  });

  it("shows an instant as dd/MM/yyyy HH:mm in Vietnam time", () => {
    expect(formatDateTime(new Date("2026-10-26T17:00:00Z"))).toBe(
      "27/10/2026 00:00",
    );
    expect(formatDateTime(new Date("2026-10-24T01:15:00Z"))).toBe(
      "24/10/2026 08:15",
    );
  });

  it("validates business date strings", () => {
    expect(isBusinessDate("2026-10-27")).toBe(true);
    expect(isBusinessDate("2026-02-30")).toBe(false);
    expect(isBusinessDate("27/10/2026")).toBe(false);
    expect(() => formatBusinessDate("2026-13-01")).toThrow("Ngày không hợp lệ");
  });
});

describe("monthRange", () => {
  it("gives the first and last day of the month", () => {
    expect(monthRange("2026-10-27" as never)).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(monthRange("2028-02-10" as never)).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });
});
