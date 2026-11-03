import { describe, expect, it } from "vitest";

import type { BusinessDate } from "./business-date";
import {
  COMPENSATION_KINDS,
  COMPENSATION_STATUSES,
  amountDue,
  assertDiscount,
  assertPriced,
  compensationLineAmount,
  compensationLines,
  compensationTotal,
  dueDate,
  summaryByKind,
  transition,
  type CompensationCommand,
} from "./compensation";

const K = 1000;
const day = (value: string) => value as BusinessDate;
const counts = (repair: number, scrap: number, lost: number, good = 0) => ({
  goodMilli: good * K,
  repairMilli: repair * K,
  scrapMilli: scrap * K,
  lostMilli: lost * K,
});

const PRICES = [
  { itemId: "H1,7", damagePrice: 50_000, lostPrice: 450_000 },
  { itemId: "CHEO1,7", damagePrice: 15_000, lostPrice: 90_000 },
  { itemId: "MAM1,6", damagePrice: 40_000, lostPrice: 380_000 },
];

/** The lines of D8 as priced lines. */
const D8 = [
  {
    itemCode: "H1,7",
    kind: "DAMAGED",
    quantityMilli: 15 * K,
    unitPrice: 50_000,
  },
  {
    itemCode: "H1,7",
    kind: "SCRAPPED",
    quantityMilli: 3 * K,
    unitPrice: 450_000,
  },
  { itemCode: "H1,7", kind: "LOST", quantityMilli: 2 * K, unitPrice: 450_000 },
  {
    itemCode: "CHEO1,7",
    kind: "DAMAGED",
    quantityMilli: 5 * K,
    unitPrice: 15_000,
  },
  {
    itemCode: "MAM1,6",
    kind: "DAMAGED",
    quantityMilli: 2 * K,
    unitPrice: 40_000,
  },
  {
    itemCode: "MAM1,6",
    kind: "LOST",
    quantityMilli: 2 * K,
    unitPrice: 380_000,
  },
] as const;

describe("compensationLines", () => {
  it("prices by condition: Phế liệu at the lost price", () => {
    const lines = compensationLines(
      [{ itemId: "H1,7", counts: counts(15, 3, 2, 80) }],
      PRICES,
    );
    expect(
      lines.map((l) => [l.kind, l.quantityMilli / K, l.unitPrice]),
    ).toEqual([
      ["DAMAGED", 15, 50_000],
      ["SCRAPPED", 3, 450_000],
      ["LOST", 2, 450_000],
    ]);
  });

  it("makes no line for zero and none for good only", () => {
    expect(
      compensationLines(
        [{ itemId: "CHEO1,7", counts: counts(0, 0, 0, 50) }],
        PRICES,
      ),
    ).toEqual([]);
  });

  it("leaves the price empty when the contract has none", () => {
    const [lostLine] = compensationLines(
      [{ itemId: "MAM1,6", counts: counts(0, 0, 2) }],
      [{ itemId: "MAM1,6", damagePrice: 40_000, lostPrice: null }],
    );
    expect(lostLine).toMatchObject({ unitPrice: null, contractPrice: null });
    expect(
      compensationLines([{ itemId: "X", counts: counts(1, 0, 0) }], [])[0]
        ?.unitPrice,
    ).toBeNull();
  });
});

describe("totals", () => {
  it("adds up D8", () => {
    expect(compensationTotal(D8)).toBe(3_915_000);
    const summary = summaryByKind(
      D8.map((line) => ({ ...line, unit: "PIECE" as const })),
    );
    expect(
      summary.map((s) => [s.kind, s.quantities[0]?.milli, s.amount]),
    ).toEqual([
      ["DAMAGED", 22 * K, 905_000],
      ["SCRAPPED", 3 * K, 1_350_000],
      ["LOST", 4 * K, 1_660_000],
    ]);
  });

  it("rounds kg lines to 1 ₫", () => {
    expect(
      compensationLineAmount({
        itemCode: "SAT",
        kind: "LOST",
        quantityMilli: 12_345,
        unitPrice: 7_500,
      }),
    ).toBe(92_588);
  });

  it("refuses approval while a line has no price", () => {
    expect(() =>
      assertPriced([
        {
          itemCode: "MAM1,6",
          kind: "LOST",
          quantityMilli: 2 * K,
          unitPrice: null,
        },
      ]),
    ).toThrow(
      "MAM1,6 Mất chưa có giá đền trong hợp đồng. Nhập đơn giá trước khi duyệt.",
    );
    expect(() => assertPriced(D8)).not.toThrow();
  });
});

describe("discount", () => {
  it("takes a discount with its reason", () => {
    expect(
      assertDiscount(3_915_000, 415_000, "  Khách quen, bớt phần chéo cong "),
    ).toBe("Khách quen, bớt phần chéo cong");
    expect(amountDue(3_915_000, 415_000)).toBe(3_500_000);
    expect(amountDue(3_915_000, 3_915_000)).toBe(0);
  });

  it("refuses a discount without reason, above the total or negative", () => {
    expect(() => assertDiscount(3_915_000, 415_000, "  ")).toThrow(
      "Bạn cần ghi lý do giảm trừ.",
    );
    expect(() => assertDiscount(3_915_000, 4_000_000, "x")).toThrow(
      "Số tiền giảm (4.000.000 ₫) lớn hơn tiền đền bù (3.915.000 ₫).",
    );
    expect(() => assertDiscount(100, -1, "x")).toThrow(
      "Số tiền giảm không được âm.",
    );
    expect(() => assertDiscount(100, 1, "x".repeat(501))).toThrow(
      "Lý do tối đa 500 ký tự.",
    );
  });

  it("drops the reason when there is no discount", () => {
    expect(assertDiscount(100, 0, "không cần")).toBeNull();
  });
});

describe("dueDate", () => {
  it("adds the credit days", () => {
    expect(dueDate(day("2026-11-06"), 15)).toBe("2026-11-21");
    expect(dueDate(day("2026-11-06"), 0)).toBe("2026-11-06");
    expect(dueDate(day("2026-12-25"), 15)).toBe("2027-01-09");
  });
});

describe("transition", () => {
  it("lets only a pending note change", () => {
    const commands: CompensationCommand[] = ["EDIT", "APPROVE", "REJECT"];
    for (const status of COMPENSATION_STATUSES) {
      for (const command of commands) {
        if (status === "PENDING") {
          expect(transition(status, command)).toBe(
            { EDIT: "PENDING", APPROVE: "APPROVED", REJECT: "REJECTED" }[
              command
            ],
          );
        } else {
          expect(() => transition(status, command)).toThrow(
            status === "APPROVED"
              ? "Phiếu đền bù đã duyệt, không sửa được nữa."
              : "Phiếu đền bù đã từ chối, không sửa được nữa.",
          );
        }
      }
    }
    expect(COMPENSATION_KINDS).toHaveLength(3);
  });
});
