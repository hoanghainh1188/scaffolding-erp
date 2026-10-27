import { describe, expect, it } from "vitest";

import type { BusinessDate } from "./business-date";
import {
  MOVEMENTS,
  assertBusinessDate,
  assertMovementLine,
  changesAverage,
  isInbound,
} from "./movement";

const day = (value: string) => value as BusinessDate;
const line = (
  overrides: Partial<Parameters<typeof assertMovementLine>[0]>,
) => ({
  movement: "PURCHASE_IN" as const,
  itemCode: "GG-K17",
  unit: "PIECE" as const,
  quantityMilli: 160_000,
  hasAmount: true,
  ...overrides,
});

describe("movement types", () => {
  it("has 13 types; only opening, purchase and repaired change the average", () => {
    expect(MOVEMENTS).toHaveLength(13);
    expect(MOVEMENTS.filter(changesAverage)).toEqual([
      "OPENING",
      "PURCHASE_IN",
      "REPAIR_IN",
    ]);
  });

  it("tells inbound from outbound", () => {
    expect(isInbound("OPENING")).toBe(true);
    expect(isInbound("RETURN_IN")).toBe(true);
    expect(isInbound("SALE_OUT")).toBe(false);
  });
});

describe("assertMovementLine", () => {
  it("accepts a valid line", () => {
    expect(() => assertMovementLine(line({}))).not.toThrow();
    expect(() =>
      assertMovementLine(
        line({
          movement: "DELIVERY_OUT",
          quantityMilli: -300_000,
          hasAmount: false,
        }),
      ),
    ).not.toThrow();
  });

  it("refuses zero and the wrong sign", () => {
    expect(() => assertMovementLine(line({ quantityMilli: 0 }))).toThrow(
      "Số lượng ghi sổ phải khác 0",
    );
    expect(() => assertMovementLine(line({ quantityMilli: -5000 }))).toThrow(
      "Dòng nhập phải có số lượng dương",
    );
    expect(() =>
      assertMovementLine(
        line({ movement: "SALE_OUT", quantityMilli: 5000, hasAmount: false }),
      ),
    ).toThrow("Dòng xuất phải có số lượng âm");
  });

  it("wants whole pieces but allows kg decimals", () => {
    expect(() => assertMovementLine(line({ quantityMilli: 2500 }))).toThrow(
      "GG-K17 tính theo cái, số lượng phải là số nguyên",
    );
    expect(() =>
      assertMovementLine(
        line({ unit: "KG", itemCode: "PL-SAT", quantityMilli: 500_500 }),
      ),
    ).not.toThrow();
  });

  it("wants an amount exactly on lines that change the average", () => {
    expect(() => assertMovementLine(line({ hasAmount: false }))).toThrow(
      "Dòng làm đổi giá vốn phải có giá trị",
    );
    expect(() =>
      assertMovementLine(line({ movement: "RETURN_IN", hasAmount: true })),
    ).toThrow("Chỉ tồn đầu kỳ, nhập mua, nhập sau sửa mới có giá trị");
  });
});

describe("assertBusinessDate", () => {
  const base = {
    today: day("2026-10-27"),
    last: day("2026-10-22"),
    itemCode: "GG-K17",
    condition: "GOOD" as const,
  };

  it("accepts the same day as the last line and today", () => {
    expect(() =>
      assertBusinessDate({ ...base, date: day("2026-10-22") }),
    ).not.toThrow();
    expect(() =>
      assertBusinessDate({ ...base, date: day("2026-10-27") }),
    ).not.toThrow();
    expect(() =>
      assertBusinessDate({ ...base, last: null, date: day("2026-01-01") }),
    ).not.toThrow();
  });

  it("refuses a backdated line", () => {
    expect(() =>
      assertBusinessDate({ ...base, date: day("2026-10-20") }),
    ).toThrow(
      "GG-K17 Tốt đã có biến động ngày 22/10/2026, không ghi lùi ngày được",
    );
  });

  it("refuses tomorrow", () => {
    expect(() =>
      assertBusinessDate({ ...base, date: day("2026-10-28") }),
    ).toThrow("Ngày ghi sổ không được sau hôm nay");
  });
});
