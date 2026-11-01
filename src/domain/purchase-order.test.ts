import { describe, expect, it } from "vitest";

import { toMoney } from "./money";
import {
  checkOrderCosts,
  checkOrderLines,
  editableFields,
  estimatedPieces,
  orderLineAmount,
  orderTotals,
  PURCHASE_COMMANDS,
  PURCHASE_MESSAGES,
  purchaseStatusLabel,
  PurchaseFieldError,
  transition,
  type OrderLineCheck,
  type OrderState,
  type PurchaseCommand,
} from "./purchase-order";

const m = toMoney;

const frame: OrderLineCheck = {
  itemCode: "GG-K17",
  itemUnit: "PIECE",
  unit: "PIECE",
  quantityMilli: 200_000,
  unitPrice: 185_000,
};

function fieldOf(run: () => unknown): { message: string; field: string } {
  try {
    run();
  } catch (error) {
    if (error instanceof PurchaseFieldError) {
      return { message: error.message, field: error.field };
    }
    throw error;
  }
  throw new Error("expected a field error");
}

describe("order totals", () => {
  it("adds up the D3 order", () => {
    const totals = orderTotals(
      [
        { quantityMilli: 200_000, unitPrice: m(185_000) },
        { quantityMilli: 400_000, unitPrice: m(32_000) },
        { quantityMilli: 150_000, unitPrice: m(145_000) },
        { quantityMilli: 1_250_500, unitPrice: m(7_500) },
      ],
      [
        { amount: m(3_500_000) },
        { amount: m(1_200_000) },
        { amount: m(180_000) },
      ],
    );
    expect(totals).toEqual({
      goods: 80_928_750,
      costs: 4_880_000,
      total: 85_808_750,
    });
  });

  it("rounds a kg line half up", () => {
    expect(orderLineAmount(212_500, m(8_201))).toBe(1_742_713);
  });

  it("estimates the pieces in a kg line, rounded down", () => {
    expect(estimatedPieces(2_000_000, "13.500")).toBe(148);
    expect(estimatedPieces(2_000_000, null)).toBeNull();
  });
});

describe("checkOrderLines", () => {
  it("accepts a line by the piece, a piece item by kg and a free line", () => {
    expect(() =>
      checkOrderLines([
        frame,
        { ...frame, itemCode: "GG-M16", unit: "KG", quantityMilli: 2_000_500 },
        { ...frame, itemCode: "GG-CH", quantityMilli: 20_000, unitPrice: 0 },
      ]),
    ).not.toThrow();
  });

  it.each<[string, OrderLineCheck[], string, string]>([
    [
      "a kg item by the piece",
      [
        {
          ...frame,
          itemCode: "PL-SAT",
          itemUnit: "KG",
        },
      ],
      "PL-SAT tính theo kg, chỉ đặt được theo kg",
      "lines.0.unit",
    ],
    [
      "half a piece",
      [{ ...frame, itemCode: "GG-CH", quantityMilli: 2_500 }],
      "GG-CH tính theo cái, số lượng phải là số nguyên",
      "lines.0.quantity",
    ],
    [
      "a zero quantity",
      [{ ...frame, quantityMilli: 0 }],
      "Số lượng phải lớn hơn 0",
      "lines.0.quantity",
    ],
    [
      "a negative price",
      [{ ...frame, unitPrice: -1 }],
      "Đơn giá phải là số nguyên không âm",
      "lines.0.unitPrice",
    ],
    [
      "the same item twice",
      [frame, frame],
      "GG-K17 đã có trong đơn, sửa số lượng ở dòng cũ",
      "lines.1.itemId",
    ],
  ])("refuses %s", (_name, lines, message, field) => {
    expect(fieldOf(() => checkOrderLines(lines))).toEqual({ message, field });
  });
});

describe("checkOrderCosts", () => {
  it("trims the labels", () => {
    expect(
      checkOrderCosts([{ label: " Bốc xếp ", amount: 1_200_000 }]),
    ).toEqual([{ label: "Bốc xếp", amount: 1_200_000 }]);
  });

  it.each([
    [
      { label: " ", amount: 500_000 },
      "Nhập tên khoản chi phí",
      "costs.0.label",
    ],
    [
      { label: "Bốc xếp", amount: 0 },
      "Chi phí phải lớn hơn 0",
      "costs.0.amount",
    ],
    [
      { label: "x".repeat(61), amount: 1 },
      "Tên khoản chi phí dài tối đa 60 ký tự",
      "costs.0.label",
    ],
  ])("refuses %o", (cost, message, field) => {
    expect(fieldOf(() => checkOrderCosts([cost]))).toEqual({ message, field });
  });
});

describe("purchaseStatusLabel", () => {
  it("names each status", () => {
    expect(purchaseStatusLabel("DRAFT", null, false)).toEqual({
      main: "Nháp",
      detail: null,
    });
    expect(purchaseStatusLabel("IN_PROGRESS", null, false).detail).toBe(
      "Chờ xe về",
    );
    expect(purchaseStatusLabel("IN_PROGRESS", null, true).detail).toBe(
      "Đang nhận",
    );
    expect(purchaseStatusLabel("DONE", "CANCELLED", false)).toEqual({
      main: "Hoàn thành",
      detail: "Đã hủy",
    });
    expect(purchaseStatusLabel("DONE", "RECEIVED", true).detail).toBe(
      "Đã nhận đủ",
    );
  });
});

describe("transition", () => {
  const draft: OrderState = {
    code: "PO-2026-054",
    status: "DRAFT",
    outcome: null,
    hasReceipts: false,
    lineCount: 2,
    expectedDate: "2026-10-28",
  };
  const waiting: OrderState = {
    ...draft,
    code: "PO-2026-055",
    status: "IN_PROGRESS",
  };
  const receiving: OrderState = {
    ...waiting,
    code: "PO-2026-051",
    hasReceipts: true,
  };
  const done: OrderState = {
    ...receiving,
    code: "PO-2026-050",
    status: "DONE",
    outcome: "RECEIVED",
  };
  const REASON = "Người bán bán cho chỗ khác";

  type Expected = { status: string; outcome: string | null } | string;
  const table: Record<string, [OrderState, Record<PurchaseCommand, Expected>]> =
    {
      draft: [
        draft,
        {
          PLACE: { status: "IN_PROGRESS", outcome: null },
          CANCEL: "Đơn PO-2026-054 chưa đặt, xóa đơn nháp nếu không cần nữa",
          CLOSE: "Đơn PO-2026-054 chưa đặt, xóa đơn nháp nếu không cần nữa",
          RECEIVE_FULL:
            "Đơn PO-2026-054 chưa đặt, xóa đơn nháp nếu không cần nữa",
          RECEIVE_SHORT:
            "Đơn PO-2026-054 chưa đặt, xóa đơn nháp nếu không cần nữa",
          RECEIVE_SHORT_WAIT:
            "Đơn PO-2026-054 chưa đặt, xóa đơn nháp nếu không cần nữa",
        },
      ],
      waiting: [
        waiting,
        {
          PLACE: "Đơn PO-2026-055 đã đặt rồi",
          CANCEL: { status: "DONE", outcome: "CANCELLED" },
          CLOSE: "Đơn chưa có phiếu nhập, dùng Hủy đơn",
          RECEIVE_FULL: { status: "DONE", outcome: "RECEIVED" },
          RECEIVE_SHORT: { status: "DONE", outcome: "CLOSED" },
          RECEIVE_SHORT_WAIT: { status: "IN_PROGRESS", outcome: null },
        },
      ],
      receiving: [
        receiving,
        {
          PLACE: "Đơn PO-2026-051 đã đặt rồi",
          CANCEL: PURCHASE_MESSAGES.cancelReceived,
          CLOSE: { status: "DONE", outcome: "CLOSED" },
          RECEIVE_FULL: { status: "DONE", outcome: "RECEIVED" },
          RECEIVE_SHORT: { status: "DONE", outcome: "CLOSED" },
          RECEIVE_SHORT_WAIT: { status: "IN_PROGRESS", outcome: null },
        },
      ],
      done: [
        done,
        Object.fromEntries(
          PURCHASE_COMMANDS.map((command) => [
            command,
            "Đơn PO-2026-050 đã xong, không đổi được nữa",
          ]),
        ) as Record<PurchaseCommand, Expected>,
      ],
    };

  for (const [name, [order, expected]] of Object.entries(table)) {
    for (const command of PURCHASE_COMMANDS) {
      it(`${name} × ${command}`, () => {
        const want = expected[command];
        const run = () => transition(order, command, REASON);
        if (typeof want === "string") expect(run).toThrow(want);
        else expect(run()).toEqual(want);
      });
    }
  }

  it("refuses to place an order without lines or a date", () => {
    expect(
      fieldOf(() => transition({ ...draft, lineCount: 0 }, "PLACE")),
    ).toEqual({ message: "Đơn cần ít nhất một dòng hàng", field: "lines" });
    expect(
      fieldOf(() => transition({ ...draft, expectedDate: null }, "PLACE")),
    ).toEqual({ message: "Nhập ngày dự kiến nhập", field: "expectedDate" });
  });

  it("needs a reason to cancel, not to close", () => {
    expect(() => transition(waiting, "CANCEL", "  ")).toThrow(
      "Nhập lý do hủy đơn",
    );
    expect(transition(receiving, "CLOSE", null)).toEqual({
      status: "DONE",
      outcome: "CLOSED",
    });
    expect(() => transition(waiting, "CANCEL", "x".repeat(501))).toThrow(
      "Lý do dài tối đa 500 ký tự",
    );
  });
});

describe("editableFields", () => {
  it("locks the lines once goods came in", () => {
    expect(editableFields({ status: "DRAFT", hasReceipts: false })).toBe("ALL");
    expect(editableFields({ status: "IN_PROGRESS", hasReceipts: false })).toBe(
      "ALL",
    );
    expect(editableFields({ status: "IN_PROGRESS", hasReceipts: true })).toBe(
      "SCHEDULE",
    );
    expect(editableFields({ status: "DONE", hasReceipts: false })).toBe("NONE");
  });
});
