// payables tasks 2.3–2.4: fixed order, splitting a supplier payment, the
// advance rule, settling later receipts from advances, due dates and status
// by Vietnamese day, with the numbers of D14c.
import { describe, expect, it } from "vitest";

import { toBusinessDate, type BusinessDate } from "./business-date";
import { toMoney } from "./money";
import {
  allocatePayment,
  applyAdvances,
  goodsSummary,
  orderPayables,
  PAYABLE_MESSAGES,
  payableDueDate,
  PayableRuleError,
  payableStatus,
  supplierStatus,
  termsHeading,
  termsLabel,
  type OpenPayable,
} from "./payables";
import { overdueOf } from "./allocation";

const d = (value: string) => value as BusinessDate;
const m = (value: number) => toMoney(value);

function pn(
  code: string,
  remaining: number,
  issued: string,
  due: string = issued,
): OpenPayable {
  return {
    key: code,
    code,
    label: code,
    issuedDate: d(issued),
    dueDate: d(due),
    remaining: m(remaining),
  };
}

/** Anh Tâm on 06/11/2026: two receipts, both due on their receipt day. */
const TAM = [
  pn("PN-2026-091", 16_250_000, "2026-11-05"),
  pn("PN-2026-090", 26_500_000, "2026-11-04"),
];

function failure(run: () => unknown): PayableRuleError {
  try {
    run();
  } catch (error) {
    if (error instanceof PayableRuleError) return error;
    throw error;
  }
  throw new Error("expected a payable rule error");
}

const pay = (
  amount: number,
  extra: Partial<Parameters<typeof allocatePayment>[0]> = {},
) =>
  allocatePayment({
    kind: "PAYMENT",
    amount: m(amount),
    supplierName: "Anh Lê Văn Tâm",
    openPayables: TAM,
    ...extra,
  });

describe("orderPayables", () => {
  it("puts the earlier due date first, then receipt day, then code", () => {
    const ordered = orderPayables([
      pn("PN-2026-092", 1, "2026-11-05"),
      pn("PN-2026-080", 1, "2026-10-17", "2026-11-01"),
      pn("PN-2026-091", 1, "2026-11-05"),
      pn("PN-2026-082", 1, "2026-10-20"),
    ]);
    expect(ordered.map((debt) => debt.code)).toEqual([
      "PN-2026-082",
      "PN-2026-080",
      "PN-2026-091",
      "PN-2026-092",
    ]);
  });
});

describe("allocatePayment", () => {
  it("pays the receipt due first (30.000.000 ₫ for Anh Tâm)", () => {
    const plan = pay(30_000_000);
    expect(plan.allocations).toEqual([
      { debtKey: "PN-2026-090", amount: 26_500_000, mode: "AUTO" },
      { debtKey: "PN-2026-091", amount: 3_500_000, mode: "AUTO" },
    ]);
    expect(plan.advance).toBe(0);
  });

  it("pays exactly what is owed", () => {
    expect(pay(42_750_000).advance).toBe(0);
  });

  it("keeps what is paid over as an advance", () => {
    expect(pay(45_000_000).advance).toBe(2_250_000);
  });

  it("splits by code when the due date ties", () => {
    const plan = pay(6_000_000, {
      openPayables: [
        pn("PN-2026-092", 5_000_000, "2026-11-05"),
        pn("PN-2026-091", 5_000_000, "2026-11-05"),
      ],
    });
    expect(plan.allocations.map((row) => [row.debtKey, row.amount])).toEqual([
      ["PN-2026-091", 5_000_000],
      ["PN-2026-092", 1_000_000],
    ]);
  });

  it("pays a named receipt first", () => {
    const plan = pay(16_250_000, {
      manual: [{ debtKey: "PN-2026-091", amount: m(16_250_000) }],
    });
    expect(plan.allocations).toEqual([
      { debtKey: "PN-2026-091", amount: 16_250_000, mode: "MANUAL" },
    ]);
  });

  it("refuses a named part over what is left", () => {
    const error = failure(() =>
      pay(20_000_000, {
        manual: [{ debtKey: "PN-2026-091", amount: m(20_000_000) }],
      }),
    );
    expect([error.message, error.status]).toEqual([
      "PN-2026-091 chỉ còn 16.250.000 ₫.",
      422,
    ]);
  });

  it("answers 409 when another payment took it meanwhile", () => {
    const error = failure(() =>
      pay(16_250_000, {
        openPayables: [pn("PN-2026-091", 0, "2026-11-05")],
        manual: [{ debtKey: "PN-2026-091", amount: m(16_250_000) }],
        seen: new Map([["PN-2026-091", m(16_250_000)]]),
      }),
    );
    expect([error.message, error.status]).toEqual([
      "PN-2026-091 đã được trả đủ bởi phiếu khác. Bạn xem lại rồi ghi.",
      409,
    ]);
  });

  it("refuses a receipt of another seller", () => {
    expect(
      failure(() =>
        pay(1_000, { manual: [{ debtKey: "PN-2026-080", amount: m(1_000) }] }),
      ).message,
    ).toBe(PAYABLE_MESSAGES.unknownDebt);
  });

  it("refuses 0 ₫", () => {
    expect(failure(() => pay(0)).message).toBe("Số tiền phải lớn hơn 0 ₫.");
  });

  it("takes an advance only from a seller who owes nothing (0.2 #102)", () => {
    expect(failure(() => pay(5_000_000, { kind: "ADVANCE" })).message).toBe(
      "Anh Lê Văn Tâm còn phải trả 42.750.000 ₫. Bạn chọn Trả tiền hàng: phần dư tự thành tiền ứng trước.",
    );
    const plan = allocatePayment({
      kind: "ADVANCE",
      amount: m(10_000_000),
      supplierName: "Chị Nguyễn Thị Hoa",
      openPayables: [pn("PN-2026-087", 0, "2026-10-22")],
    });
    expect(plan).toEqual({ allocations: [], advance: 10_000_000 });
  });
});

describe("applyAdvances", () => {
  const advance = (key: string, date: string, available: number) => ({
    key,
    date: d(date),
    code: key,
    available: m(available),
  });

  it("pays a smaller new receipt in full", () => {
    expect(
      applyAdvances({
        advances: [advance("PC-2026-040", "2026-11-01", 10_000_000)],
        openPayables: [pn("PN-2026-093", 6_400_000, "2026-11-06")],
      }),
    ).toEqual([
      { sourceKey: "PC-2026-040", debtKey: "PN-2026-093", amount: 6_400_000 },
    ]);
  });

  it("leaves the rest of a larger receipt owed", () => {
    const rows = applyAdvances({
      advances: [advance("PC-2026-040", "2026-11-01", 10_000_000)],
      openPayables: [pn("PN-2026-094", 14_000_000, "2026-11-06")],
    });
    expect(rows.map((row) => row.amount)).toEqual([10_000_000]);
  });

  it("uses the older advance first", () => {
    const rows = applyAdvances({
      advances: [
        advance("PC-2026-046", "2026-11-05", 5_000_000),
        advance("PC-2026-040", "2026-11-01", 3_000_000),
      ],
      openPayables: [pn("PN-2026-094", 4_000_000, "2026-11-06")],
    });
    expect(rows.map((row) => [row.sourceKey, row.amount])).toEqual([
      ["PC-2026-040", 3_000_000],
      ["PC-2026-046", 1_000_000],
    ]);
  });
});

describe("due date and status", () => {
  it("adds the seller's days to the receipt day", () => {
    expect(payableDueDate(d("2026-11-04"), 0)).toBe("2026-11-04");
    expect(payableDueDate(d("2026-10-27"), 15)).toBe("2026-11-11");
    expect(payableDueDate(d("2026-11-05"), 30)).toBe("2026-12-05");
  });

  it("turns overdue at 0:00 Vietnamese time", () => {
    const at = (iso: string) => toBusinessDate(new Date(iso));
    expect(
      payableStatus(16_250_000, d("2026-11-05"), at("2026-11-05T16:59:00Z"))
        .label,
    ).toBe("Hạn hôm nay");
    expect(
      payableStatus(16_250_000, d("2026-11-05"), at("2026-11-05T17:00:00Z"))
        .label,
    ).toBe("Quá hạn 1 ngày");
    expect(payableStatus(0, d("2026-10-22"), d("2026-11-06")).label).toBe(
      "Đã trả đủ",
    );
  });

  it("sums Anh Tâm's overdue debt", () => {
    expect(overdueOf(TAM, d("2026-11-06"))).toEqual({
      amount: 42_750_000,
      days: 2,
    });
  });

  it("follows the D14 rule for the seller row (0.2 #104)", () => {
    const today = d("2026-11-06");
    const status = (due: string, remaining = 1, advance = 0) =>
      supplierStatus({
        payables: [{ remaining: m(remaining), dueDate: d(due) }],
        advance: m(advance),
        today,
      }).label;
    expect(status("2026-11-20")).toBe("Chưa đến hạn");
    expect(status("2026-11-13")).toBe("Hạn 13/11");
    expect(status("2026-11-14")).toBe("Chưa đến hạn");
    expect(status("2026-11-01")).toBe("Quá hạn 5 ngày");
    expect(status("2026-11-01", 0, 10_000_000)).toBe("Đã ứng trước");
    expect(status("2026-11-01", 0)).toBe("Hết nợ");
  });
});

describe("labels", () => {
  it("names the terms", () => {
    expect([termsLabel(0), termsLabel(30)]).toEqual(["trả ngay", "nợ 30 ngày"]);
    expect([termsHeading(0), termsHeading(15)]).toEqual([
      "Trả ngay khi nhập",
      "Nợ 15 ngày",
    ]);
  });

  it("sums up the goods of a receipt", () => {
    expect(
      goodsSummary([
        {
          quantityMilli: 650_000,
          unit: "PIECE",
          name: "chéo 1,7m cũ",
          weighed: false,
        },
        {
          quantityMilli: 120_000,
          unit: "PIECE",
          name: "khung 1,7m cũ",
          weighed: false,
        },
        { quantityMilli: 80_000, unit: "PIECE", name: "mâm", weighed: false },
        {
          quantityMilli: 40_000,
          unit: "BAR",
          name: "cây chống",
          weighed: false,
        },
      ]),
    ).toBe("650 chéo 1,7m cũ, 120 khung 1,7m cũ và 2 mã khác");
    expect(
      goodsSummary([
        {
          quantityMilli: 3_312_500,
          unit: "KG",
          name: "sắt ống",
          weighed: true,
        },
      ]),
    ).toBe("3.312,5 kg sắt ống cân thực tế");
  });
});
