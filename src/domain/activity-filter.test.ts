import { describe, expect, it } from "vitest";

import {
  defaultRange,
  filterParams,
  parseActivityFilter,
} from "./activity-filter";
import type { BusinessDate } from "./business-date";

const TODAY = "2026-10-28" as BusinessDate;

describe("parseActivityFilter", () => {
  it("opens on the last 7 days, today included", () => {
    expect(parseActivityFilter({}, TODAY)).toEqual({
      ok: true,
      filter: {
        from: "2026-10-22",
        to: "2026-10-28",
        userId: null,
        type: null,
        code: null,
        group: null,
        review: false,
      },
    });
    expect(defaultRange(TODAY)).toEqual({
      from: "2026-10-22",
      to: "2026-10-28",
    });
  });

  it("reads every filter", () => {
    const result = parseActivityFilter(
      {
        from: "2026-10-27",
        to: "2026-10-28",
        user: "u1",
        type: "STOCKTAKE",
        code: " KK-2026-003 ",
        group: "APPROVAL",
        review: "1",
      },
      TODAY,
    );
    expect(result).toMatchObject({
      ok: true,
      filter: {
        userId: "u1",
        type: "STOCKTAKE",
        code: "KK-2026-003",
        group: "APPROVAL",
        review: true,
      },
    });
  });

  it.each([
    [
      { from: "2026-10-28", to: "2026-10-27" },
      "Từ ngày phải trước hoặc bằng đến ngày",
    ],
    [{ from: "28/10/2026" }, "Ngày không hợp lệ"],
    [{ from: "2025-10-27", to: "2026-10-28" }, "Chọn khoảng tối đa 366 ngày"],
    [{ type: "INVOICE" }, "Loại chứng từ không hợp lệ"],
    [{ group: "VIEW" }, "Nhóm thao tác không hợp lệ"],
    [{ code: "x".repeat(61) }, "Mã chứng từ dài tối đa 60 ký tự"],
  ])("refuses %o", (params, error) => {
    expect(parseActivityFilter(params, TODAY)).toEqual({ ok: false, error });
  });

  it("accepts exactly 366 days and a one-day range", () => {
    expect(
      parseActivityFilter({ from: "2025-10-28", to: "2026-10-28" }, TODAY).ok,
    ).toBe(true);
    expect(
      parseActivityFilter({ from: "2026-10-28", to: "2026-10-28" }, TODAY).ok,
    ).toBe(true);
  });
});

describe("filterParams", () => {
  it("leaves the defaults out and round-trips the rest", () => {
    const parsed = parseActivityFilter(
      { code: "NCC-0004", review: "1" },
      TODAY,
    );
    if (!parsed.ok) throw new Error(parsed.error);
    expect(filterParams(parsed.filter, TODAY).toString()).toBe(
      "code=NCC-0004&review=1",
    );
    const ranged = parseActivityFilter(
      { from: "2026-10-27", to: "2026-10-28" },
      TODAY,
    );
    if (!ranged.ok) throw new Error(ranged.error);
    expect(filterParams(ranged.filter, TODAY).toString()).toBe(
      "from=2026-10-27&to=2026-10-28",
    );
  });
});
