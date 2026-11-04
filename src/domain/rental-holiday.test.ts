import { describe, expect, it } from "vitest";

import type { BusinessDate } from "./business-date";
import { DomainValueError } from "./errors";
import {
  checkHoliday,
  firstOverlap,
  HOLIDAY_MESSAGES,
  holidayDaysIn,
  holidayLength,
  holidaysIn,
  type HolidayRange,
} from "./rental-holiday";

const d = (value: string) => value as BusinessDate;
const TET: HolidayRange = {
  id: "tet",
  name: "Tết Nguyên đán",
  startDate: d("2027-02-05"),
  endDate: d("2027-02-13"),
};
const NEW_YEAR: HolidayRange = {
  id: "ny",
  name: "Tết Dương lịch",
  startDate: d("2027-01-01"),
  endDate: d("2027-01-01"),
};

describe("holidayDaysIn", () => {
  it("counts the 9 days of Tết inside February 2027", () => {
    expect(holidayDaysIn(d("2027-02-01"), d("2027-02-28"), [TET])).toBe(9);
    expect(holidayLength(TET)).toBe(9);
  });

  it("clips a holiday cut by the start or the end of the range", () => {
    expect(holidayDaysIn(d("2027-02-10"), d("2027-02-28"), [TET])).toBe(4);
    expect(holidayDaysIn(d("2027-02-01"), d("2027-02-06"), [TET])).toBe(2);
  });

  it("counts nothing outside the range or for an empty range", () => {
    expect(holidayDaysIn(d("2027-03-01"), d("2027-03-31"), [TET])).toBe(0);
    expect(holidayDaysIn(d("2027-02-10"), d("2027-02-09"), [TET])).toBe(0);
  });

  it("does not take off a holiday on the delivery day (not counted anyway)", () => {
    // Delivered 01/01/2027: rent starts 02/01.
    expect(holidayDaysIn(d("2027-01-02"), d("2027-01-31"), [NEW_YEAR])).toBe(0);
  });

  it("takes off a holiday on the return day", () => {
    const may: HolidayRange = {
      name: "30/4 – 1/5",
      startDate: d("2027-04-30"),
      endDate: d("2027-05-01"),
    };
    expect(holidayDaysIn(d("2027-04-01"), d("2027-04-30"), [may])).toBe(1);
  });

  it("adds several rows", () => {
    expect(
      holidayDaysIn(d("2027-01-01"), d("2027-02-28"), [TET, NEW_YEAR]),
    ).toBe(10);
  });
});

describe("holidaysIn", () => {
  it("lists the rows of the period with their days in it", () => {
    expect(
      holidaysIn(d("2027-02-01"), d("2027-02-28"), [NEW_YEAR, TET]),
    ).toEqual([{ ...TET, days: 9 }]);
  });
});

describe("checkHoliday", () => {
  const fails = (input: Parameters<typeof checkHoliday>[0]) => {
    try {
      checkHoliday(input);
    } catch (error) {
      expect(error).toBeInstanceOf(DomainValueError);
      return (error as Error).message;
    }
    return "";
  };

  it("trims the name and keeps the range", () => {
    expect(
      checkHoliday({
        name: "  Tết Nguyên đán ",
        startDate: "2027-02-05",
        endDate: "2027-02-13",
      }),
    ).toEqual({
      name: "Tết Nguyên đán",
      startDate: "2027-02-05",
      endDate: "2027-02-13",
    });
  });

  it("refuses an end before the start", () => {
    expect(
      fails({ name: "Tết", startDate: "2027-02-13", endDate: "2027-02-05" }),
    ).toBe("Ngày kết thúc phải từ ngày bắt đầu trở đi.");
  });

  it("refuses more than 31 days", () => {
    expect(
      fails({ name: "Dài", startDate: "2027-02-01", endDate: "2027-03-15" }),
    ).toBe(HOLIDAY_MESSAGES.tooLong);
    expect(
      fails({ name: "Tháng", startDate: "2027-01-01", endDate: "2027-01-31" }),
    ).toBe("");
  });

  it("refuses an empty name, a long name and a bad date", () => {
    expect(
      fails({ name: " ", startDate: "2027-02-05", endDate: "2027-02-13" }),
    ).toBe(HOLIDAY_MESSAGES.nameRequired);
    expect(
      fails({
        name: "x".repeat(101),
        startDate: "2027-02-05",
        endDate: "2027-02-13",
      }),
    ).toBe(HOLIDAY_MESSAGES.nameTooLong);
    expect(
      fails({ name: "Tết", startDate: "2027-02-30", endDate: "2027-02-13" }),
    ).toBe(HOLIDAY_MESSAGES.dateRequired);
  });
});

describe("firstOverlap", () => {
  it("names the first shared day and the other row", () => {
    const extra: HolidayRange = {
      name: "Nghỉ bù",
      startDate: d("2027-02-13"),
      endDate: d("2027-02-14"),
    };
    const hit = firstOverlap(extra, [NEW_YEAR, TET]);
    expect(hit?.day).toBe("2027-02-13");
    expect(
      HOLIDAY_MESSAGES.overlap(hit?.day ?? "", hit?.holiday.name ?? ""),
    ).toBe(
      'Ngày 13/02/2027 đã nằm trong "Tết Nguyên đán". Bạn sửa dòng đó hoặc chọn ngày khác.',
    );
  });

  it("ignores the row being edited", () => {
    expect(
      firstOverlap({ ...TET, endDate: d("2027-02-14") }, [NEW_YEAR, TET]),
    ).toBeNull();
  });
});
