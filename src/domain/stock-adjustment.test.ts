import { describe, expect, it } from "vitest";

import type { BusinessDate } from "./business-date";
import {
  ADJUSTMENT_PREFIX,
  adjustmentMovements,
  assertAdjustmentLine,
  assertOpeningDate,
  formatDocumentCode,
  normalizeReason,
  type AdjustmentLineInput,
} from "./stock-adjustment";

const line = (
  overrides: Partial<AdjustmentLineInput>,
): AdjustmentLineInput => ({
  lineType: "QUANTITY",
  itemId: "gg-k17",
  condition: "GOOD",
  toCondition: null,
  locationId: "bai-01",
  toLocationId: null,
  quantityMilli: -5000,
  unitCost: null,
  valueDelta: null,
  ...overrides,
});
const valueLine = (valueDelta: number | null) =>
  line({ lineType: "VALUE", locationId: null, quantityMilli: 0, valueDelta });
const day = (value: string) => value as BusinessDate;

describe("normalizeReason", () => {
  it("trims and requires a reason", () => {
    expect(normalizeReason("  Đếm lại bãi thiếu 5 cái ")).toBe(
      "Đếm lại bãi thiếu 5 cái",
    );
    expect(() => normalizeReason("   ")).toThrow("Nhập lý do điều chỉnh");
    expect(() => normalizeReason(null, "Nhập lý do trả lại")).toThrow(
      "Nhập lý do trả lại",
    );
    expect(() => normalizeReason("x".repeat(501))).toThrow(
      "Lý do dài tối đa 500 ký tự",
    );
  });
});

describe("assertAdjustmentLine", () => {
  it("accepts each line type in its document kind", () => {
    expect(() => assertAdjustmentLine("ADJUSTMENT", line({}))).not.toThrow();
    expect(() =>
      assertAdjustmentLine(
        "ADJUSTMENT",
        line({
          lineType: "CONDITION",
          toCondition: "NEEDS_REPAIR",
          quantityMilli: 10_000,
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertAdjustmentLine(
        "ADJUSTMENT",
        line({
          lineType: "LOCATION",
          toLocationId: "ct-0005",
          quantityMilli: 20_000,
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertAdjustmentLine(
        "OPENING",
        line({
          lineType: "OPENING",
          quantityMilli: 1_000_000,
          unitCost: 195_000,
        }),
      ),
    ).not.toThrow();
  });

  it("refuses moves to the same place", () => {
    expect(() =>
      assertAdjustmentLine(
        "ADJUSTMENT",
        line({
          lineType: "CONDITION",
          toCondition: "GOOD",
          quantityMilli: 10_000,
        }),
      ),
    ).toThrow("Tình trạng đi và đến phải khác nhau");
    expect(() =>
      assertAdjustmentLine(
        "ADJUSTMENT",
        line({
          lineType: "LOCATION",
          toLocationId: "bai-01",
          quantityMilli: 1000,
        }),
      ),
    ).toThrow("Vị trí đi và đến phải khác nhau");
    expect(() =>
      assertAdjustmentLine(
        "ADJUSTMENT",
        line({ lineType: "CONDITION", toCondition: null, quantityMilli: 1000 }),
      ),
    ).toThrow("Chọn tình trạng");
  });

  it("checks quantities and costs", () => {
    expect(() =>
      assertAdjustmentLine("ADJUSTMENT", line({ quantityMilli: 0 })),
    ).toThrow("Số lượng điều chỉnh phải khác 0");
    expect(() =>
      assertAdjustmentLine(
        "ADJUSTMENT",
        line({
          lineType: "CONDITION",
          toCondition: "SCRAP",
          quantityMilli: -1000,
        }),
      ),
    ).toThrow("Số lượng chuyển phải lớn hơn 0");
    expect(() =>
      assertAdjustmentLine(
        "ADJUSTMENT",
        line({ lineType: "LOCATION", toLocationId: "x", quantityMilli: 0 }),
      ),
    ).toThrow("Số lượng chuyển phải lớn hơn 0");
    expect(() =>
      assertAdjustmentLine(
        "OPENING",
        line({ lineType: "OPENING", quantityMilli: 0, unitCost: 1 }),
      ),
    ).toThrow("Số lượng tồn đầu phải lớn hơn 0");
    expect(() =>
      assertAdjustmentLine(
        "OPENING",
        line({ lineType: "OPENING", quantityMilli: 1000, unitCost: null }),
      ),
    ).toThrow("Nhập đơn giá vốn");
    expect(() =>
      assertAdjustmentLine("ADJUSTMENT", line({ unitCost: -1 })),
    ).toThrow("Đơn giá phải là số nguyên không âm");
    expect(() =>
      assertAdjustmentLine(
        "ADJUSTMENT",
        line({ condition: "BROKEN" as never }),
      ),
    ).toThrow("Chọn tình trạng");
  });

  it("keeps opening lines in opening documents only", () => {
    expect(() => assertAdjustmentLine("OPENING", line({}))).toThrow(
      "Dòng không hợp với loại phiếu",
    );
    expect(() =>
      assertAdjustmentLine(
        "ADJUSTMENT",
        line({ lineType: "OPENING", quantityMilli: 1000, unitCost: 1 }),
      ),
    ).toThrow("Dòng không hợp với loại phiếu");
  });

  it("keeps value lines in value documents only", () => {
    expect(() =>
      assertAdjustmentLine("REVALUE", valueLine(-1_500_000)),
    ).not.toThrow();
    expect(() => assertAdjustmentLine("REVALUE", line({}))).toThrow(
      "Dòng không hợp với loại phiếu",
    );
    expect(() =>
      assertAdjustmentLine("ADJUSTMENT", valueLine(-1_500_000)),
    ).toThrow("Dòng không hợp với loại phiếu");
    expect(() => assertAdjustmentLine("REVALUE", valueLine(0))).toThrow(
      "Chênh lệch giá trị phải khác 0",
    );
    expect(() => assertAdjustmentLine("REVALUE", valueLine(null))).toThrow(
      "Chênh lệch giá trị phải khác 0",
    );
    expect(() => assertAdjustmentLine("REVALUE", valueLine(-1.5))).toThrow(
      "Chênh lệch giá trị phải là số nguyên đồng",
    );
  });

  it("wants a location on every other line", () => {
    expect(() =>
      assertAdjustmentLine("ADJUSTMENT", line({ locationId: null })),
    ).toThrow("Chọn vị trí");
  });

  it("does not turn value lines into quantity movements", () => {
    expect(() =>
      adjustmentMovements("ĐCG-2026-001", "x", [valueLine(1)]),
    ).toThrow("Dòng không hợp với loại phiếu");
  });
});

describe("adjustmentMovements", () => {
  it("turns a condition fix into exactly two lines at the same place", () => {
    const drafts = adjustmentMovements(
      "ĐC-2026-004",
      "Sửa PTH-2026-064: 10 cái thực tế là Chờ sửa",
      [
        line({
          lineType: "CONDITION",
          toCondition: "NEEDS_REPAIR",
          quantityMilli: 10_000,
        }),
      ],
    );
    expect(drafts).toEqual([
      expect.objectContaining({
        movement: "ADJUST_OUT",
        condition: "GOOD",
        locationId: "bai-01",
        quantityMilli: -10_000,
      }),
      expect.objectContaining({
        movement: "ADJUST_IN",
        condition: "NEEDS_REPAIR",
        locationId: "bai-01",
        quantityMilli: 10_000,
        pairedWith: 0,
      }),
    ]);
    expect(drafts[0]?.description).toBe(
      "ĐC-2026-004: Sửa PTH-2026-064: 10 cái thực tế là Chờ sửa",
    );
  });

  it("moves between locations in the same condition", () => {
    const drafts = adjustmentMovements("ĐC-2026-005", "Ghi nhầm công trình", [
      line({
        lineType: "LOCATION",
        locationId: "ct-0003",
        toLocationId: "ct-0005",
        quantityMilli: 20_000,
      }),
    ]);
    expect(
      drafts.map((d) => [
        d.movement,
        d.condition,
        d.locationId,
        d.quantityMilli,
      ]),
    ).toEqual([
      ["ADJUST_OUT", "GOOD", "ct-0003", -20_000],
      ["ADJUST_IN", "GOOD", "ct-0005", 20_000],
    ]);
  });

  it("makes one line for a quantity change, keeping a given unit cost", () => {
    expect(adjustmentMovements("ĐC-1", "Đếm thiếu", [line({})])).toEqual([
      expect.objectContaining({ movement: "ADJUST_OUT", quantityMilli: -5000 }),
    ]);
    expect(
      adjustmentMovements("ĐC-1", "Đếm thừa", [
        line({ quantityMilli: 20_000, unitCost: 172_000 }),
      ]),
    ).toEqual([
      expect.objectContaining({ movement: "ADJUST_IN", unitCost: 172_000 }),
    ]);
  });

  it("values opening lines at quantity × unit cost", () => {
    const [opening] = adjustmentMovements("TĐK-2026-001", "Số đầu", [
      line({
        lineType: "OPENING",
        quantityMilli: 1_220_000,
        unitCost: 195_000,
      }),
    ]);
    expect(opening).toEqual(
      expect.objectContaining({ movement: "OPENING", amount: 237_900_000 }),
    );
    const [kg] = adjustmentMovements("TĐK-2026-001", "Số đầu", [
      line({ lineType: "OPENING", quantityMilli: 12_850_500, unitCost: 7_952 }),
    ]);
    expect(kg?.amount).toBe(102_187_176);
  });

  it("needs at least one line", () => {
    expect(() => adjustmentMovements("ĐC-1", "x", [])).toThrow(
      "Phiếu cần ít nhất một dòng",
    );
  });
});

describe("codes and dates", () => {
  it("formats document codes", () => {
    expect(formatDocumentCode("ĐC", 2026, 4)).toBe("ĐC-2026-004");
    expect(formatDocumentCode("TĐK", 2026, 1)).toBe("TĐK-2026-001");
    expect(formatDocumentCode("ĐC", 2026, 1234)).toBe("ĐC-2026-1234");
    expect(formatDocumentCode(ADJUSTMENT_PREFIX.REVALUE, 2026, 1)).toBe(
      "ĐCG-2026-001",
    );
  });

  it("checks the opening date", () => {
    expect(assertOpeningDate(day("2026-10-01"), day("2026-10-27"))).toBe(
      "2026-10-01",
    );
    expect(() => assertOpeningDate(null, day("2026-10-27"))).toThrow(
      "Chọn ngày tồn đầu",
    );
    expect(() =>
      assertOpeningDate(day("2026-10-28"), day("2026-10-27")),
    ).toThrow("Ngày tồn đầu không được sau hôm nay");
  });
});
