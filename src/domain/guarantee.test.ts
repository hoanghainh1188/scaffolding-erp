import { describe, expect, it } from "vitest";

import type { BusinessDate } from "./business-date";
import { guaranteeWarnings, reminderDate } from "./guarantee";

const d = (value: string) => value as BusinessDate;

const warn = (today: string, end: string | null = null) =>
  guaranteeWarnings({
    guaranteeNumber: "BL-2026-1188",
    expiryDate: d("2027-03-31"),
    today: d(today),
    contractEndDate: end === null ? null : d(end),
  });

describe("guarantee warnings (0.2 #50)", () => {
  it("says nothing with 31 days left", () => {
    expect(warn("2027-02-28")).toEqual([]);
  });

  it("warns with 30 days left", () => {
    expect(warn("2027-03-01")).toEqual([
      {
        kind: "EXPIRING",
        message: "Bảo lãnh BL-2026-1188 còn 30 ngày (hết hạn 31/03/2027)",
      },
    ]);
  });

  it("warns on the expiry day itself", () => {
    expect(warn("2027-03-31").map((entry) => entry.kind)).toEqual(["EXPIRING"]);
  });

  it("says expired the day after", () => {
    expect(warn("2027-04-01")).toEqual([
      {
        kind: "EXPIRED",
        message: "Bảo lãnh BL-2026-1188 đã hết hạn ngày 31/03/2027",
      },
    ]);
  });

  it("warns when it ends before the rental is expected to end", () => {
    expect(warn("2026-10-30", "2027-04-30")).toEqual([
      {
        kind: "ENDS_BEFORE_CONTRACT",
        message:
          "Bảo lãnh BL-2026-1188 hết hạn 31/03/2027, trước ngày kết thúc dự kiến 30/04/2027",
      },
    ]);
  });

  it("says nothing when it outlasts the rental", () => {
    expect(warn("2026-10-30", "2027-03-21")).toEqual([]);
  });

  it("gives the reminder date 30 days before", () => {
    expect(reminderDate(d("2027-03-31"))).toBe("2027-03-01");
  });
});
