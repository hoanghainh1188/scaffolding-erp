import { describe, expect, it } from "vitest";

import {
  capChanges,
  diffFields,
  diffLines,
  touchesSensitive,
  withTotal,
  type FieldSpec,
  type LineSpec,
} from "./activity-changes";
import { formatMoney, toMoney } from "./money";
import { formatPhone } from "./partner-fields";

interface Supplier {
  name: string;
  phone: string | null;
  idNumber: string | null;
  bankAccount: string | null;
}

const SUPPLIER: readonly FieldSpec<Supplier>[] = [
  { field: "name", label: "Tên", value: (s) => s.name },
  {
    field: "phone",
    label: "Số điện thoại",
    value: (s) => (s.phone ? formatPhone(s.phone.replace(/\s/g, "")) : null),
  },
  {
    field: "idNumber",
    label: "CCCD",
    value: (s) => s.idNumber,
    sensitive: "ID_NUMBER",
  },
  {
    field: "bankAccount",
    label: "Số tài khoản",
    value: (s) => s.bankAccount,
    sensitive: "BANK_ACCOUNT",
  },
];

const ncc4: Supplier = {
  name: "Anh Tư – Bình Dương",
  phone: "0903123456",
  idNumber: "001203012345",
  bankAccount: "0451000312341234",
};

describe("diffFields", () => {
  it("returns nothing when nothing changed", () => {
    expect(diffFields(SUPPLIER, ncc4, { ...ncc4 })).toEqual([]);
  });

  it("compares the shown value: spacing in a phone is no change", () => {
    expect(
      diffFields(SUPPLIER, ncc4, { ...ncc4, phone: "0903 123 456" }),
    ).toEqual([]);
  });

  it("keeps only the field that changed", () => {
    expect(
      diffFields(SUPPLIER, ncc4, { ...ncc4, phone: "0903123457" }),
    ).toEqual([
      {
        field: "phone",
        label: "Số điện thoại",
        before: formatPhone("0903123456"),
        after: formatPhone("0903123457"),
      },
    ]);
  });

  it("masks a bank account and never returns the raw number", () => {
    const changes = diffFields(SUPPLIER, ncc4, {
      ...ncc4,
      bankAccount: "0451000312345678",
    });
    expect(changes).toEqual([
      {
        field: "bankAccount",
        label: "Số tài khoản",
        before: "•••• 1234",
        after: "•••• 5678",
      },
    ]);
    const text = JSON.stringify(changes);
    expect(text).not.toContain("0451000312345678");
    expect(text).not.toContain("0451000312341234");
    expect(touchesSensitive(SUPPLIER, changes)).toBe(true);
  });

  it("still records a new account with the same last four digits", () => {
    expect(
      diffFields(SUPPLIER, ncc4, { ...ncc4, bankAccount: "9999000312341234" }),
    ).toEqual([
      {
        field: "bankAccount",
        label: "Số tài khoản",
        before: "•••• 1234",
        after: "•••• 1234 (đã đổi)",
      },
    ]);
  });

  it("masks a CCCD, and a cleared one shows as null", () => {
    const changes = diffFields(SUPPLIER, ncc4, { ...ncc4, idNumber: null });
    expect(changes).toEqual([
      {
        field: "idNumber",
        label: "CCCD",
        before: "•••• •••• 2345",
        after: null,
      },
    ]);
    expect(JSON.stringify(changes)).not.toContain("001203012345");
  });

  it("a name change is not sensitive", () => {
    const changes = diffFields(SUPPLIER, ncc4, { ...ncc4, name: "Anh Tư" });
    expect(changes).toHaveLength(1);
    expect(touchesSensitive(SUPPLIER, changes)).toBe(false);
  });
});

interface Line {
  code: string;
  quantity: number;
  unitPrice: number;
}

const money = (value: number) => formatMoney(toMoney(value));

const LINES: LineSpec<Line> = {
  field: "lines",
  key: (line) => line.code,
  whole: (line) => `${line.quantity} cái × ${money(line.unitPrice)}`,
  columns: [
    { field: "quantity", label: "Số lượng", value: (l) => `${l.quantity} cái` },
    { field: "unitPrice", label: "Đơn giá", value: (l) => money(l.unitPrice) },
  ],
};

describe("diffLines", () => {
  const before: Line[] = [
    { code: "GG-K17", quantity: 280, unitPrice: 190_000 },
    { code: "GG-K12", quantity: 20, unitPrice: 150_000 },
  ];

  it("names a changed column with the item code", () => {
    expect(
      diffLines(LINES, before, [
        { code: "GG-K17", quantity: 280, unitPrice: 185_000 },
        before[1] as Line,
      ]),
    ).toEqual([
      {
        field: "lines.GG-K17.unitPrice",
        label: "Đơn giá GG-K17",
        before: "190.000 ₫",
        after: "185.000 ₫",
      },
    ]);
  });

  it("writes added and removed lines whole", () => {
    expect(
      diffLines(LINES, before, [
        before[0] as Line,
        { code: "PK-KU", quantity: 50, unitPrice: 40_000 },
      ]),
    ).toEqual([
      {
        field: "lines.GG-K12",
        label: "Dòng GG-K12",
        before: "20 cái × 150.000 ₫",
        after: null,
      },
      {
        field: "lines.PK-KU",
        label: "Dòng PK-KU",
        before: null,
        after: "50 cái × 40.000 ₫",
      },
    ]);
  });

  it("returns nothing for the same lines", () => {
    expect(
      diffLines(
        LINES,
        before,
        before.map((l) => ({ ...l })),
      ),
    ).toEqual([]);
  });
});

describe("withTotal", () => {
  const total = {
    field: "total",
    label: "Tổng tiền hàng của đơn",
    before: "52.942.500 ₫",
    after: "51.942.500 ₫",
  };
  const price = {
    field: "lines.GG-K17.unitPrice",
    label: "Đơn giá GG-K17",
    before: "190.000 ₫",
    after: "185.000 ₫",
  };

  it("adds the order total after the line change", () => {
    expect(withTotal([price], total)).toEqual([price, total]);
  });

  it("adds nothing when nothing else changed or the total did not move", () => {
    expect(withTotal([], total)).toEqual([]);
    expect(withTotal([price], { ...total, after: total.before })).toEqual([
      price,
    ]);
  });
});

describe("capChanges", () => {
  const many = Array.from({ length: 60 }, (_, i) => ({
    field: `f${i}`,
    label: `Trường ${i}`,
    before: "a",
    after: "b",
  }));

  it("keeps 49 and folds the rest", () => {
    const capped = capChanges(many);
    expect(capped).toHaveLength(50);
    expect(capped[48]?.field).toBe("f48");
    expect(capped[49]).toEqual({
      field: "_more",
      label: "Và 11 thay đổi khác",
      before: null,
      after: null,
    });
  });

  it("leaves 50 or fewer alone", () => {
    expect(capChanges(many.slice(0, 50))).toHaveLength(50);
    expect(capChanges(many.slice(0, 50)).at(-1)?.field).toBe("f49");
  });
});
