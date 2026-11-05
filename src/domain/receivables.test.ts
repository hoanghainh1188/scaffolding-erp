// receivables tasks 2.1–2.6: fixed order, splitting a payment, prepayment,
// overdue by Vietnamese day, VAT of a sale and the deposit set-off, with the
// numbers of D14 and D14b.
import { describe, expect, it } from "vitest";

import type { BusinessDate } from "./business-date";
import { toMoney, type Money } from "./money";
import {
  allocate,
  applyCredits,
  customerStatus,
  debtKey,
  debtStatus,
  dueSoonOf,
  orderDebts,
  overdueOf,
  ReceivableRuleError,
  saleVat,
  settlementPlan,
  type DebtKind,
  type OpenDebt,
} from "./receivables";

const d = (value: string) => value as BusinessDate;
const m = (value: number) => toMoney(value);

function debt(
  kind: DebtKind,
  code: string,
  remaining: number,
  dueDate: string,
  issuedDate: string,
  contractCode = "082026/ANPHAT-MINHPHAT",
): OpenDebt {
  return {
    key: debtKey(kind, `${contractCode}:${code}`),
    kind,
    contractCode,
    documentCode: code,
    issuedDate: d(issuedDate),
    dueDate: d(dueDate),
    remaining: m(remaining),
    label: code,
  };
}

// Minh Phát on 05/11/2026 (D14).
const px041 = debt(
  "SALE",
  "PX-2026-041",
  21_500_000,
  "2026-10-17",
  "2026-10-02",
  "102026/ANPHAT-MINHPHAT",
);
const db009 = debt(
  "COMPENSATION",
  "ĐB-2026-009",
  4_250_000,
  "2026-11-06",
  "2026-10-22",
);
const oct082 = debt(
  "BILLING",
  "2026-10",
  22_800_000,
  "2026-11-15",
  "2026-10-31",
);
const oct092 = debt(
  "BILLING",
  "2026-10",
  14_500_000,
  "2026-11-15",
  "2026-10-31",
  "092026/ANPHAT-MINHPHAT",
);
const mla003 = debt(
  "BUY_BACK",
  "MLA-2026-003",
  6_000_000,
  "2026-11-18",
  "2026-11-03",
);
const minhPhat = [mla003, oct092, db009, oct082, px041];

const amounts = (rows: { debtKey: string; amount: Money }[]) =>
  rows.map((row) => [row.debtKey, row.amount]);

describe("orderDebts", () => {
  it("puts earlier due first whatever the input order", () => {
    expect(orderDebts(minhPhat).map((row) => row.key)).toEqual(
      [px041, db009, oct082, oct092, mla003].map((row) => row.key),
    );
  });

  it("orders two periods with the same due and day by contract", () => {
    expect(orderDebts([oct092, oct082])[0]?.contractCode).toBe(
      "082026/ANPHAT-MINHPHAT",
    );
  });

  it("orders the same due and day by kind: period before compensation", () => {
    const db010 = debt(
      "COMPENSATION",
      "ĐB-2026-010",
      1,
      "2026-11-15",
      "2026-10-31",
    );
    expect(orderDebts([db010, oct092])[0]?.kind).toBe("BILLING");
  });
});

describe("allocate", () => {
  it("takes 30.000.000 ₫ over the earliest due debts", () => {
    const result = allocate({ amount: m(30_000_000), openDebts: minhPhat });
    expect(amounts(result.allocations)).toEqual([
      [px041.key, 21_500_000],
      [db009.key, 4_250_000],
      [oct082.key, 4_250_000],
    ]);
    expect(result.unapplied).toBe(0);
    const owed = minhPhat.reduce((sum, row) => sum + row.remaining, 0);
    expect(owed - 30_000_000).toBe(39_050_000);
  });

  it("settles a single debt exactly", () => {
    const only = debt(
      "BILLING",
      "2026-10",
      12_000_000,
      "2026-11-15",
      "2026-10-31",
    );
    const result = allocate({ amount: m(12_000_000), openDebts: [only] });
    expect(result.unapplied).toBe(0);
    expect(amounts(result.allocations)).toEqual([[only.key, 12_000_000]]);
  });

  it("keeps an overpayment as prepayment", () => {
    const only = debt(
      "BILLING",
      "2026-10",
      12_000_000,
      "2026-11-15",
      "2026-10-31",
    );
    expect(
      allocate({ amount: m(17_000_000), openDebts: [only] }).unapplied,
    ).toBe(5_000_000);
  });

  it("keeps everything when nothing is owed", () => {
    expect(allocate({ amount: m(3_000_000), openDebts: [] })).toEqual({
      allocations: [],
      unapplied: 3_000_000,
    });
  });

  it("pays the named debt first", () => {
    const result = allocate({
      amount: m(14_500_000),
      openDebts: minhPhat,
      manual: [{ debtKey: oct092.key, amount: m(14_500_000) }],
    });
    expect(result.allocations).toEqual([
      { debtKey: oct092.key, amount: 14_500_000, mode: "MANUAL" },
    ]);
  });

  it("spreads what is left after the named part", () => {
    const result = allocate({
      amount: m(10_000_000),
      openDebts: minhPhat,
      manual: [{ debtKey: mla003.key, amount: m(6_000_000) }],
    });
    expect(result.allocations).toEqual([
      { debtKey: mla003.key, amount: 6_000_000, mode: "MANUAL" },
      { debtKey: px041.key, amount: 4_000_000, mode: "AUTO" },
    ]);
  });

  it("refuses naming more than is left", () => {
    expect(() =>
      allocate({
        amount: m(5_000_000),
        openDebts: minhPhat,
        manual: [{ debtKey: db009.key, amount: m(5_000_000) }],
      }),
    ).toThrow("ĐB-2026-009 chỉ còn 4.250.000 ₫.");
  });

  it("answers 409 when another receipt took the named debt", () => {
    const paid = { ...db009, remaining: m(0) };
    try {
      allocate({
        amount: m(4_250_000),
        openDebts: [paid],
        manual: [{ debtKey: db009.key, amount: m(4_250_000) }],
        seen: new Map([[db009.key, m(4_250_000)]]),
      });
      expect.fail("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ReceivableRuleError);
      expect((error as ReceivableRuleError).status).toBe(409);
      expect((error as Error).message).toBe(
        "ĐB-2026-009 đã được trừ đủ bởi phiếu khác. Bạn xem lại rồi ghi.",
      );
    }
  });

  it("refuses a debt of another customer and named parts above the amount", () => {
    expect(() =>
      allocate({
        amount: m(1_000),
        openDebts: minhPhat,
        manual: [{ debtKey: "SALE:other", amount: m(1_000) }],
      }),
    ).toThrow("Khoản được chọn không thuộc nhà thầu này.");
    expect(() =>
      allocate({
        amount: m(1_000),
        openDebts: minhPhat,
        manual: [{ debtKey: px041.key, amount: m(2_000) }],
      }),
    ).toThrow("Tổng các khoản chỉ định vượt số tiền phiếu thu (1.000 ₫).");
  });

  it("refuses 0 ₫ and skips settled debts", () => {
    expect(() => allocate({ amount: m(0), openDebts: [] })).toThrow(
      "Số tiền phải lớn hơn 0 ₫.",
    );
    const settled = { ...px041, remaining: m(0) };
    expect(
      amounts(
        allocate({ amount: m(1_000), openDebts: [settled, db009] }).allocations,
      ),
    ).toEqual([[db009.key, 1_000]]);
  });
});

describe("applyCredits", () => {
  const nov = debt("BILLING", "2026-11", 8_000_000, "2026-12-15", "2026-11-30");
  const credit = (key: string, available: number, date = "2026-11-20") => ({
    key,
    date: d(date),
    code: key,
    available: m(available),
  });

  it("settles a new period from the prepayment", () => {
    expect(
      applyCredits({
        credits: [credit("PT-140", 5_000_000)],
        openDebts: [nov],
      }),
    ).toEqual([{ sourceKey: "PT-140", debtKey: nov.key, amount: 5_000_000 }]);
  });

  it("leaves the rest of a large prepayment", () => {
    const db020 = debt(
      "COMPENSATION",
      "ĐB-2026-020",
      1_200_000,
      "2026-12-01",
      "2026-11-16",
    );
    const rows = applyCredits({
      credits: [credit("PT-140", 5_000_000)],
      openDebts: [db020],
    });
    expect(rows).toEqual([
      { sourceKey: "PT-140", debtKey: db020.key, amount: 1_200_000 },
    ]);
  });

  it("uses older sources first", () => {
    const rows = applyCredits({
      credits: [
        credit("PT-150", 9_000_000, "2026-11-25"),
        credit("PT-140", 3_000_000),
      ],
      openDebts: [nov],
    });
    expect(rows.map((row) => [row.sourceKey, row.amount])).toEqual([
      ["PT-140", 3_000_000],
      ["PT-150", 5_000_000],
    ]);
  });

  it("uses a negative period like a prepayment", () => {
    const px060 = debt(
      "SALE",
      "PX-2026-060",
      200_000,
      "2027-03-20",
      "2027-03-05",
    );
    expect(
      applyCredits({
        credits: [credit("BILLING:mar", 50_000, "2027-03-31")],
        openDebts: [px060],
      }),
    ).toEqual([
      { sourceKey: "BILLING:mar", debtKey: px060.key, amount: 50_000 },
    ]);
  });
});

describe("debtStatus and overdueOf", () => {
  it("is due tomorrow, due today, then overdue one day", () => {
    expect(debtStatus(4_250_000, d("2026-11-06"), d("2026-11-05")).label).toBe(
      "Hạn mai",
    );
    expect(debtStatus(4_250_000, d("2026-11-06"), d("2026-11-06")).label).toBe(
      "Hạn hôm nay",
    );
    expect(debtStatus(4_250_000, d("2026-11-06"), d("2026-11-07"))).toEqual({
      kind: "OVERDUE",
      days: 1,
      label: "Quá hạn 1 ngày",
    });
    expect(debtStatus(1, d("2026-11-15"), d("2026-11-05")).label).toBe(
      "Chưa đến hạn",
    );
    expect(debtStatus(0, d("2026-10-17"), d("2026-11-05")).label).toBe(
      "Đã thu đủ",
    );
  });

  it("gives Minh Phát 21.500.000 ₫ overdue for 19 days", () => {
    expect(overdueOf(minhPhat, d("2026-11-05"))).toEqual({
      amount: 21_500_000,
      days: 19,
    });
  });

  it("adds two overdue debts and counts from the earliest", () => {
    const a = debt("SALE", "A", 1_000_000, "2026-10-10", "2026-10-01");
    const b = debt("SALE", "B", 2_000_000, "2026-11-01", "2026-10-20");
    expect(overdueOf([a, b], d("2026-11-05"))).toEqual({
      amount: 3_000_000,
      days: 26,
    });
  });

  it("ignores a debt paid in full after its due date", () => {
    expect(overdueOf([{ ...px041, remaining: m(0) }], d("2026-11-05"))).toEqual(
      {
        amount: 0,
        days: 0,
      },
    );
  });

  it("sums what falls due within 7 days", () => {
    expect(dueSoonOf(minhPhat, d("2026-11-08"))).toBe(22_800_000 + 14_500_000);
    expect(dueSoonOf(minhPhat, d("2026-11-11"))).toBe(
      22_800_000 + 14_500_000 + 6_000_000,
    );
  });
});

describe("customerStatus", () => {
  const today = d("2026-11-05");
  it("reports overdue, due soon, not due, prepaid and clear", () => {
    expect(
      customerStatus({ debts: minhPhat, prepaid: m(0), today }).label,
    ).toBe("Quá hạn 19 ngày");
    const soon = debt(
      "BILLING",
      "2026-10",
      74_500_000,
      "2026-11-10",
      "2026-10-31",
    );
    expect(customerStatus({ debts: [soon], prepaid: m(0), today }).label).toBe(
      "Hạn 10/11",
    );
    const later = debt("BILLING", "2026-10", 1, "2026-11-30", "2026-10-31");
    expect(customerStatus({ debts: [later], prepaid: m(0), today }).label).toBe(
      "Chưa đến hạn",
    );
    expect(
      customerStatus({ debts: [], prepaid: m(5_000_000), today }).label,
    ).toBe("Trả trước");
    expect(customerStatus({ debts: [], prepaid: m(0), today }).label).toBe(
      "Hết nợ",
    );
  });
});

describe("saleVat", () => {
  it("adds 8 % on goods and freight of PX-2026-041", () => {
    const vat = saleVat(m(52_574_074), m(1_500_000), 800);
    expect(vat).toBe(4_325_926);
    expect(52_574_074 + 1_500_000 + vat).toBe(58_400_000);
  });

  it("is 0 without VAT and 10 % without freight", () => {
    expect(saleVat(m(10_000_000), m(0), null)).toBe(0);
    expect(saleVat(m(3_000_000), m(0), 1000)).toBe(300_000);
  });
});

describe("settlementPlan", () => {
  // 082026/ANPHAT-MINHPHAT on 04/12/2026 (D14b).
  const oct = debt(
    "BILLING",
    "2026-10",
    18_550_000,
    "2026-11-15",
    "2026-10-31",
  );
  const db014 = debt(
    "COMPENSATION",
    "ĐB-2026-014",
    3_600_000,
    "2026-12-05",
    "2026-11-20",
  );
  const nov = debt(
    "BILLING",
    "2026-11",
    11_750_000,
    "2026-12-15",
    "2026-11-30",
  );
  const deposit = (
    amount: number,
    code = "PT-2026-104",
    date = "2026-08-05",
  ) => ({
    key: code,
    code,
    date: d(date),
    available: m(amount),
  });

  it("sets 50.000.000 ₫ off 33.900.000 ₫ and refunds 16.100.000 ₫", () => {
    const plan = settlementPlan({
      deposits: [deposit(50_000_000)],
      contractDebts: [nov, db014, oct],
      expectedRefund: m(16_100_000),
    });
    expect(plan).toMatchObject({
      deposit: 50_000_000,
      offset: 33_900_000,
      refund: 16_100_000,
      stillOwed: 0,
    });
    expect(plan.allocations.map((row) => row.amount)).toEqual([
      18_550_000, 3_600_000, 11_750_000,
    ]);
  });

  it("leaves 13.900.000 ₫ owed when the deposit is 20.000.000 ₫", () => {
    const plan = settlementPlan({
      deposits: [deposit(20_000_000)],
      contractDebts: [oct, db014, nov],
    });
    expect(plan.refund).toBe(0);
    expect(plan.stillOwed).toBe(13_900_000);
    expect(plan.allocations.map((row) => [row.debtKey, row.amount])).toEqual([
      [oct.key, 18_550_000],
      [db014.key, 1_450_000],
    ]);
  });

  it("refunds nothing without a deposit", () => {
    expect(
      settlementPlan({ deposits: [], contractDebts: [db014] }),
    ).toMatchObject({ deposit: 0, offset: 0, refund: 0, stillOwed: 3_600_000 });
  });

  it("uses older deposit receipts first", () => {
    const plan = settlementPlan({
      deposits: [
        deposit(30_000_000, "PT-2026-120", "2026-09-01"),
        deposit(5_000_000),
      ],
      contractDebts: [oct],
    });
    expect(plan.allocations.map((row) => [row.sourceKey, row.amount])).toEqual([
      ["PT-2026-104", 5_000_000],
      ["PT-2026-120", 13_550_000],
    ]);
    expect(plan.refund).toBe(16_450_000);
  });

  it("answers 409 when the refund changed since it was shown", () => {
    try {
      settlementPlan({
        deposits: [deposit(50_000_000)],
        contractDebts: [oct, nov],
        expectedRefund: m(16_100_000),
      });
      expect.fail("should throw");
    } catch (error) {
      expect((error as ReceivableRuleError).status).toBe(409);
      expect((error as Error).message).toBe(
        "Số hoàn cọc đã đổi từ 16.100.000 ₫ thành 19.700.000 ₫ từ lúc bạn mở. Bạn xem lại rồi thanh lý.",
      );
    }
  });
});
