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
      PURCHASE_MESSAGES.kgOnly("PL-SAT"),
      "lines.0.unit",
    ],
    [
      "half a piece",
      [{ ...frame, itemCode: "GG-CH", quantityMilli: 2_500 }],
      PURCHASE_MESSAGES.wholePieces("GG-CH"),
      "lines.0.quantity",
    ],
    [
      "a zero quantity",
      [{ ...frame, quantityMilli: 0 }],
      PURCHASE_MESSAGES.quantity,
      "lines.0.quantity",
    ],
    [
      "a negative price",
      [{ ...frame, unitPrice: -1 }],
      PURCHASE_MESSAGES.price,
      "lines.0.unitPrice",
    ],
    [
      "the same item twice",
      [frame, frame],
      PURCHASE_MESSAGES.duplicate("GG-K17"),
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
      PURCHASE_MESSAGES.costLabel,
      "costs.0.label",
    ],
    [
      { label: "Bốc xếp", amount: 0 },
      PURCHASE_MESSAGES.costAmount,
      "costs.0.amount",
    ],
    [
      { label: "x".repeat(61), amount: 1 },
      PURCHASE_MESSAGES.costLabelLong,
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
          CANCEL: PURCHASE_MESSAGES.notPlaced(draft.code),
          CLOSE: PURCHASE_MESSAGES.notPlaced(draft.code),
          RECEIVE_FULL: PURCHASE_MESSAGES.notPlaced(draft.code),
          RECEIVE_SHORT: PURCHASE_MESSAGES.notPlaced(draft.code),
          RECEIVE_SHORT_WAIT: PURCHASE_MESSAGES.notPlaced(draft.code),
        },
      ],
      waiting: [
        waiting,
        {
          PLACE: PURCHASE_MESSAGES.placed(waiting.code),
          CANCEL: { status: "DONE", outcome: "CANCELLED" },
          CLOSE: PURCHASE_MESSAGES.closeNoReceipts,
          RECEIVE_FULL: { status: "DONE", outcome: "RECEIVED" },
          RECEIVE_SHORT: { status: "DONE", outcome: "CLOSED" },
          RECEIVE_SHORT_WAIT: { status: "IN_PROGRESS", outcome: null },
        },
      ],
      receiving: [
        receiving,
        {
          PLACE: PURCHASE_MESSAGES.placed(receiving.code),
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
            PURCHASE_MESSAGES.done(done.code),
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
    ).toEqual({ message: PURCHASE_MESSAGES.noLines, field: "lines" });
    expect(
      fieldOf(() => transition({ ...draft, expectedDate: null }, "PLACE")),
    ).toEqual({ message: PURCHASE_MESSAGES.noDate, field: "expectedDate" });
  });

  it("needs a reason to cancel, not to close", () => {
    expect(() => transition(waiting, "CANCEL", "  ")).toThrow(
      PURCHASE_MESSAGES.cancelReason,
    );
    expect(transition(receiving, "CLOSE", null)).toEqual({
      status: "DONE",
      outcome: "CLOSED",
    });
    expect(() => transition(waiting, "CANCEL", "x".repeat(501))).toThrow(
      PURCHASE_MESSAGES.reasonTooLong,
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
