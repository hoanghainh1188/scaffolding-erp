import { describe, expect, it } from "vitest";

import {
  checkReceiptLines,
  EMPTY_SPLIT,
  isOpenLine,
  linesAfterTrip,
  openLines,
  orderCommandAfterReceipt,
  ReceiptConflictError,
  storedAwaitsRest,
  type ReceiptLineInput,
  type ReceivingLine,
} from "./goods-receipt";
import { PURCHASE_MESSAGES, PurchaseFieldError } from "./purchase-order";

const K = 1000;

/** The four lines of PO-2026-052 (drawing D3), none received yet. */
const KHUNG: ReceivingLine = {
  orderLineId: "khung",
  itemCode: "GG-K17",
  itemUnit: "PIECE",
  lineUnit: "PIECE",
  standardWeightKg: "13.500",
  orderedMilli: 200 * K,
  receivedMilli: 0,
  lastAwaitsRest: null,
};
const CHEO: ReceivingLine = {
  ...KHUNG,
  orderLineId: "cheo",
  itemCode: "GG-CH",
  standardWeightKg: "2.800",
  orderedMilli: 400 * K,
};
const MAM: ReceivingLine = {
  ...KHUNG,
  orderLineId: "mam",
  itemCode: "GG-M16",
  standardWeightKg: "11.000",
  orderedMilli: 150 * K,
};
const SAT: ReceivingLine = {
  ...KHUNG,
  orderLineId: "sat",
  itemCode: "PL-SAT",
  itemUnit: "KG",
  lineUnit: "KG",
  standardWeightKg: null,
  orderedMilli: 1_250_500,
};
const OPEN = [KHUNG, CHEO, MAM, SAT];

function counted(
  open: ReceivingLine,
  quantity: number,
  split: Partial<Record<keyof typeof EMPTY_SPLIT, number>>,
  extra: Partial<ReceiptLineInput> = {},
): ReceiptLineInput {
  return {
    orderLineId: open.orderLineId,
    status: "COUNTED",
    quantityMilli: quantity,
    weighedKgMilli: null,
    split: { ...EMPTY_SPLIT, ...split },
    awaitsRest: false,
    ...extra,
  };
}

function notInTrip(open: ReceivingLine, awaitsRest = true): ReceiptLineInput {
  return {
    orderLineId: open.orderLineId,
    status: "NOT_IN_TRIP",
    quantityMilli: 0,
    weighedKgMilli: null,
    split: EMPTY_SPLIT,
    awaitsRest,
  };
}

/** Trip 1 of design D4. */
const TRIP_1 = [
  counted(KHUNG, 196 * K, {
    GOOD: 150 * K,
    NEEDS_REPAIR: 34 * K,
    SCRAP: 12 * K,
  }),
  counted(CHEO, 400 * K, { GOOD: 380 * K, NEEDS_REPAIR: 20 * K }),
  notInTrip(MAM),
  counted(SAT, 1_250_500, { SCRAP: 1_250_500 }),
];

function failure(run: () => void): { message: string; field?: string } {
  try {
    run();
  } catch (error) {
    if (error instanceof PurchaseFieldError) {
      return { message: error.message, field: error.field };
    }
    if (error instanceof Error) return { message: error.message };
  }
  return { message: "none" };
}

describe("checkReceiptLines", () => {
  it("accepts trip 1 of design D4", () => {
    expect(() =>
      checkReceiptLines("PO-2026-052", "USED", OPEN, TRIP_1),
    ).not.toThrow();
  });

  it("refuses a missing open line", () => {
    const lines = TRIP_1.filter((line) => line.orderLineId !== "mam");
    expect(
      failure(() => checkReceiptLines("PO-2026-052", "USED", OPEN, lines)),
    ).toEqual({
      message: 'Còn 1 mã chưa đếm hoặc đánh dấu "Chuyến này không có"',
      field: "lines",
    });
  });

  it("refuses a line the order does not expect as a conflict", () => {
    const lines = [...TRIP_1, { ...notInTrip(MAM), orderLineId: "k15" }];
    expect(() => checkReceiptLines("PO-2026-052", "USED", OPEN, lines)).toThrow(
      ReceiptConflictError,
    );
    expect(
      failure(() => checkReceiptLines("PO-2026-052", "USED", OPEN, lines)),
    ).toEqual({
      message: "Đơn PO-2026-052 vừa thay đổi, mở lại đơn để đếm theo số mới",
    });
  });

  it("refuses the same line twice as a conflict", () => {
    const lines = [...TRIP_1, notInTrip(MAM)];
    expect(() => checkReceiptLines("PO-2026-052", "USED", OPEN, lines)).toThrow(
      ReceiptConflictError,
    );
  });

  it("refuses a trip where nothing came", () => {
    const lines = OPEN.map((open) => notInTrip(open));
    expect(
      failure(() => checkReceiptLines("PO-2026-052", "USED", OPEN, lines)),
    ).toEqual({ message: "Chuyến này chưa nhận mã nào", field: "lines" });
  });

  it("refuses a counted zero", () => {
    const lines = [...TRIP_1];
    lines[1] = counted(CHEO, 0, {});
    expect(
      failure(() => checkReceiptLines("PO-2026-052", "USED", OPEN, lines)),
    ).toEqual({
      message: 'Số đếm bằng 0 thì chọn "Chuyến này không có"',
      field: "lines.1.quantity",
    });
  });

  it("refuses half a piece", () => {
    const lines = [...TRIP_1];
    lines[1] = counted(CHEO, 399_500, { GOOD: 399_500 });
    expect(
      failure(() => checkReceiptLines("PO-2026-052", "USED", OPEN, lines)),
    ).toEqual({
      message: PURCHASE_MESSAGES.wholePieces("GG-CH"),
      field: "lines.1.quantity",
    });
  });

  it("needs the weighed kg of a kg line of a piece item", () => {
    const byKg: ReceivingLine = {
      ...KHUNG,
      lineUnit: "KG",
      orderedMilli: 2_000_000,
    };
    const line = counted(byKg, 146 * K, { GOOD: 146 * K });
    expect(
      failure(() => checkReceiptLines("PO-1", "USED", [byKg], [line])),
    ).toEqual({
      message: "Nhập số kg cân thực tế",
      field: "lines.0.weighedKg",
    });
    expect(() =>
      checkReceiptLines(
        "PO-1",
        "USED",
        [byKg],
        [{ ...line, weighedKgMilli: 1_987_500 }],
      ),
    ).not.toThrow();
  });

  it("refuses a split that does not add up", () => {
    const lines = [...TRIP_1];
    lines[0] = counted(KHUNG, 196 * K, {
      GOOD: 150 * K,
      NEEDS_REPAIR: 30 * K,
      SCRAP: 12 * K,
    });
    expect(
      failure(() => checkReceiptLines("PO-2026-052", "USED", OPEN, lines)),
    ).toEqual({ message: "Còn 4 chưa phân loại", field: "lines.0.split" });
    lines[0] = counted(KHUNG, 196 * K, { GOOD: 190 * K, SCRAP: 12 * K });
    expect(
      failure(() => checkReceiptLines("PO-2026-052", "USED", OPEN, lines)),
    ).toEqual({ message: "Vượt 6 so với tổng", field: "lines.0.split" });
  });

  it("puts a new-goods order into Mới only", () => {
    const line = counted(KHUNG, 300 * K, { GOOD: 300 * K });
    expect(
      failure(() => checkReceiptLines("PO-1", "NEW", [KHUNG], [line])),
    ).toEqual({
      message: "Đơn hàng mới nhập hết vào tình trạng Mới",
      field: "lines.0.split",
    });
    expect(() =>
      checkReceiptLines(
        "PO-1",
        "NEW",
        [KHUNG],
        [counted(KHUNG, 300 * K, { NEW: 300 * K })],
      ),
    ).not.toThrow();
  });

  it("puts a kg item of a used order into Phế liệu only", () => {
    const line = counted(SAT, 1_250_500, { GOOD: 1_250_500 });
    expect(
      failure(() => checkReceiptLines("PO-1", "USED", [SAT], [line])),
    ).toEqual({
      message: "PL-SAT tính theo kg, nhập thẳng vào tình trạng Phế liệu",
      field: "lines.0.split",
    });
  });

  it("keeps Mới out of a used order", () => {
    const line = counted(KHUNG, 10 * K, { NEW: 10 * K });
    expect(
      failure(() => checkReceiptLines("PO-1", "USED", [KHUNG], [line])),
    ).toEqual({
      message: "Đơn hàng cũ không nhập vào tình trạng Mới",
      field: "lines.0.split",
    });
  });

  it("refuses a quantity on a not-in-trip line", () => {
    const lines = [...TRIP_1];
    lines[2] = { ...notInTrip(MAM), quantityMilli: 5 * K };
    expect(
      failure(() => checkReceiptLines("PO-2026-052", "USED", OPEN, lines)),
    ).toEqual({
      message: 'Dòng "Chuyến này không có" phải ghi 0',
      field: "lines.2.quantity",
    });
  });
});

describe("open lines and the order command (design D6)", () => {
  it("keeps every line open before the first receipt", () => {
    expect(openLines(OPEN)).toHaveLength(4);
  });

  it("closes a short line that does not wait and keeps an awaited one", () => {
    const after = linesAfterTrip(OPEN, TRIP_1);
    const byId = new Map(after.map((line) => [line.orderLineId, line]));
    expect(byId.get("khung")).toMatchObject({
      receivedMilli: 196 * K,
      lastAwaitsRest: false,
    });
    expect(isOpenLine(byId.get("khung") as ReceivingLine)).toBe(false);
    expect(byId.get("mam")).toMatchObject({
      receivedMilli: 0,
      lastAwaitsRest: true,
    });
    expect(openLines(after).map((line) => line.orderLineId)).toEqual(["mam"]);
    expect(orderCommandAfterReceipt(after)).toBe("RECEIVE_SHORT_WAIT");
  });

  it("closes the order short after trip 2 of design D4", () => {
    const afterOne = linesAfterTrip(OPEN, TRIP_1);
    const mam = afterOne.find((line) => line.orderLineId === "mam");
    const afterTwo = linesAfterTrip(afterOne, [
      counted(mam as ReceivingLine, 150 * K, {
        GOOD: 146 * K,
        NEEDS_REPAIR: 4 * K,
      }),
    ]);
    expect(orderCommandAfterReceipt(afterTwo)).toBe("RECEIVE_SHORT");
  });

  it("receives in full when every line reaches its order", () => {
    const after = linesAfterTrip(
      [KHUNG],
      [counted(KHUNG, 200 * K, { GOOD: 200 * K })],
    );
    expect(orderCommandAfterReceipt(after)).toBe("RECEIVE_FULL");
  });

  it("counts extra as received in full", () => {
    const after = linesAfterTrip(
      [{ ...SAT, orderedMilli: 200 * K }],
      [counted(SAT, 212_500, { SCRAP: 212_500 })],
    );
    expect(orderCommandAfterReceipt(after)).toBe("RECEIVE_FULL");
  });

  it("closes at once when a short counted line does not wait", () => {
    const after = linesAfterTrip(
      [KHUNG],
      [counted(KHUNG, 196 * K, { GOOD: 196 * K })],
    );
    expect(orderCommandAfterReceipt(after)).toBe("RECEIVE_SHORT");
  });

  it("waits when a short counted line is ticked", () => {
    const after = linesAfterTrip(
      [KHUNG],
      [counted(KHUNG, 60 * K, { GOOD: 60 * K }, { awaitsRest: true })],
    );
    expect(after[0]).toMatchObject({
      receivedMilli: 60 * K,
      lastAwaitsRest: true,
    });
    expect(orderCommandAfterReceipt(after)).toBe("RECEIVE_SHORT_WAIT");
  });

  it("compares a kg line of a piece item by weighed kg", () => {
    const byKg: ReceivingLine = {
      ...KHUNG,
      lineUnit: "KG",
      orderedMilli: 2_000_000,
    };
    const after = linesAfterTrip(
      [byKg],
      [
        counted(
          byKg,
          146 * K,
          { GOOD: 146 * K },
          { weighedKgMilli: 1_987_500, awaitsRest: true },
        ),
      ],
    );
    expect(after[0]?.receivedMilli).toBe(1_987_500);
    expect(orderCommandAfterReceipt(after)).toBe("RECEIVE_SHORT_WAIT");
  });

  it("stores no wait on a line that is no longer short", () => {
    expect(
      storedAwaitsRest(
        KHUNG,
        counted(KHUNG, 200 * K, { GOOD: 200 * K }, { awaitsRest: true }),
      ),
    ).toBe(false);
  });

  it("keeps a line closed short on a later receipt", () => {
    expect(
      isOpenLine({ ...KHUNG, receivedMilli: 0, lastAwaitsRest: false }),
    ).toBe(false);
  });
});
