import { describe, expect, it } from "vitest";

import {
  allocateTransfer,
  assertMovedQuantities,
  assertTransferLines,
  drawLabel,
  requireTransferReason,
  transition,
  type TransferCheck,
  type TransferContract,
  type TransferLineInput,
} from "./site-transfer";

const K = 1000;
const site = (fresh: number, good: number) => ({
  NEW: fresh * K,
  GOOD: good * K,
});

const anPhu: TransferContract = {
  id: "a",
  code: "102026/ANPHAT-MINHPHAT",
  type: "RENTAL",
  status: "ACTIVE",
  customerId: "minhphat",
  customerName: "Minh Phát",
  siteName: "An Phú – Block B",
};
const duongNoi: TransferContract = {
  id: "b",
  code: "112026/ANPHAT-MINHPHAT",
  type: "RENTAL",
  status: "APPROVED",
  customerId: "minhphat",
  customerName: "Minh Phát",
  siteName: "Trường THCS Dương Nội",
};

const line = (code: string, count: number): TransferLineInput => ({
  itemId: code,
  itemCode: code,
  unit: "PIECE",
  milli: count * K,
});

const check = (overrides: Partial<TransferCheck> = {}): TransferCheck => ({
  from: anPhu,
  to: duongNoi,
  lines: [line("H1,7", 50), line("CHEO1,7", 40)],
  onSite: new Map([
    ["H1,7", site(20, 100)],
    ["CHEO1,7", site(0, 260)],
  ]),
  onTarget: new Set(["H1,7", "CHEO1,7"]),
  remaining: new Map([
    ["H1,7", 600 * K],
    ["CHEO1,7", 600 * K],
  ]),
  otherCustomerConfirmed: false,
  overContractConfirmed: false,
  ...overrides,
});

describe("transition", () => {
  it("follows the status table", () => {
    expect(transition("DRAFT", "POST", "CCT-2026-004")).toBe("POSTED");
    expect(transition("DRAFT", "SEND", "CCT-2026-004")).toBe("SENT");
    expect(transition("SENT", "POST", "CCT-2026-004", true)).toBe("POSTED");
    expect(transition("SENT", "PULL_BACK", "CCT-2026-004")).toBe("DRAFT");
    expect(transition("SENT", "CANCEL", "CCT-2026-004")).toBe("CANCELLED");
  });

  it("refuses editing a sent transfer", () => {
    expect(() => transition("SENT", "EDIT", "CCT-2026-004")).toThrow(
      "Phiếu đã gửi điện thoại. Bạn rút về rồi sửa.",
    );
  });

  it("refuses pulling back a posted transfer", () => {
    expect(() => transition("POSTED", "PULL_BACK", "CCT-2026-004")).toThrow(
      "Phiếu CCT-2026-004 đã chuyển nên không sửa được.",
    );
  });

  it("refuses the phone posting a draft and the office a sent one", () => {
    expect(() => transition("DRAFT", "POST", "CCT-2026-004", true)).toThrow(
      "Phiếu CCT-2026-004 chưa gửi điện thoại.",
    );
    expect(() => transition("SENT", "POST", "CCT-2026-004")).toThrow();
  });

  it("needs a cancel reason", () => {
    expect(() => requireTransferReason("  ")).toThrow(
      "Bạn ghi lý do hủy phiếu chuyển.",
    );
    expect(requireTransferReason(" Khách hoãn ")).toBe("Khách hoãn");
  });
});

describe("assertTransferLines", () => {
  it("keeps the lines of a same-customer transfer", () => {
    const result = assertTransferLines(check());
    expect(result.lines).toHaveLength(2);
    expect(result.sameCustomer).toBe(true);
    expect(result.unusual).toBe(false);
  });

  it("refuses more than is at the source site", () => {
    expect(() =>
      assertTransferLines(check({ lines: [line("H1,7", 130)] })),
    ).toThrow(
      "H1,7: số chuyển (130 cái) nhiều hơn số đang ở công trình An Phú – Block B (120 cái).",
    );
  });

  it("refuses an item missing on the receiving contract", () => {
    expect(() =>
      assertTransferLines(
        check({
          lines: [line("MAM1,6", 20)],
          onSite: new Map([["MAM1,6", site(0, 60)]]),
        }),
      ),
    ).toThrow(
      "MAM1,6 chưa có trên hợp đồng 112026/ANPHAT-MINHPHAT. Bạn lập phụ lục cho hợp đồng đó trước.",
    );
  });

  it("needs the tick for another customer, then flags it", () => {
    const phuDat = {
      ...duongNoi,
      customerId: "phudat",
      customerName: "Phú Đạt",
    };
    expect(() => assertTransferLines(check({ to: phuDat }))).toThrow(
      "Hai hợp đồng khác nhà thầu (Minh Phát → Phú Đạt). Bạn tích xác nhận trước khi chuyển.",
    );
    const result = assertTransferLines(
      check({ to: phuDat, otherCustomerConfirmed: true }),
    );
    expect(result.sameCustomer).toBe(false);
    expect(result.unusual).toBe(true);
  });

  it("needs the tick over the receiving contract's remaining", () => {
    const remaining = new Map([
      ["H1,7", 600 * K],
      ["CHEO1,7", 30 * K],
    ]);
    expect(() => assertTransferLines(check({ remaining }))).toThrow(
      "CHEO1,7: chuyển 40 cái, hợp đồng nhận chỉ còn phải giao 30 cái. Bạn xác nhận nếu đúng.",
    );
    const result = assertTransferLines(
      check({ remaining, overContractConfirmed: true }),
    );
    expect(result.unusual).toBe(true);
  });

  it("refuses a sale contract, the same contract, a draft source", () => {
    expect(() =>
      assertTransferLines(check({ to: { ...duongNoi, type: "SALE" } })),
    ).toThrow("Chỉ chuyển sang hợp đồng thuê đã duyệt hoặc đang thực hiện.");
    expect(() => assertTransferLines(check({ to: anPhu }))).toThrow(
      "Hợp đồng nhận phải khác hợp đồng đi.",
    );
    expect(() =>
      assertTransferLines(check({ from: { ...anPhu, status: "APPROVED" } })),
    ).toThrow("Chỉ chuyển được hàng của hợp đồng thuê đang thực hiện.");
  });

  it("drops empty lines and refuses a transfer with none", () => {
    expect(
      assertTransferLines(
        check({ lines: [line("H1,7", 50), line("CHEO1,7", 0)] }),
      ).lines,
    ).toHaveLength(1);
    expect(() =>
      assertTransferLines(check({ lines: [line("H1,7", 0)] })),
    ).toThrow("Phiếu chuyển chưa có hàng nào.");
  });

  it("refuses fractions of a piece", () => {
    expect(() =>
      assertTransferLines(
        check({ lines: [{ ...line("H1,7", 0), milli: 10_500 }] }),
      ),
    ).toThrow("H1,7 tính theo cái, số lượng phải là số nguyên");
  });
});

describe("assertMovedQuantities", () => {
  const moved = (plannedCount: number, movedCount: number) => ({
    itemId: "CHEO1,7",
    itemCode: "CHEO1,7",
    unit: "PIECE" as const,
    plannedMilli: plannedCount * K,
    movedMilli: movedCount * K,
  });

  it("accepts carrying less", () => {
    expect(() => assertMovedQuantities([moved(40, 36)])).not.toThrow();
  });

  it("refuses carrying more", () => {
    expect(() =>
      assertMovedQuantities([{ ...moved(50, 55), itemCode: "H1,7" }]),
    ).toThrow(
      "Bạn chở 55 cái H1,7, nhiều hơn số văn phòng ghi 50 cái. Văn phòng cần sửa phiếu nếu muốn chuyển thêm.",
    );
  });

  it("refuses carrying nothing", () => {
    expect(() => assertMovedQuantities([moved(40, 0), moved(50, 0)])).toThrow(
      "Phiếu chưa có hàng nào được chở. Bạn báo văn phòng hủy phiếu nếu không chuyển.",
    );
  });
});

describe("allocateTransfer", () => {
  it("moves Mới first, then Tốt, paired at the target", () => {
    const drafts = allocateTransfer({
      code: "CCT-2026-004",
      fromLocationId: "an-phu",
      toLocationId: "duong-noi",
      itemId: "H1,7",
      milli: 50 * K,
      onSite: site(20, 100),
    });
    expect(
      drafts.map((d) => [
        d.movement,
        d.condition,
        d.locationId,
        d.quantityMilli,
        d.pairedWith,
      ]),
    ).toEqual([
      ["TRANSFER_OUT", "NEW", "an-phu", -20 * K, undefined],
      ["TRANSFER_IN", "NEW", "duong-noi", 20 * K, 0],
      ["TRANSFER_OUT", "GOOD", "an-phu", -30 * K, undefined],
      ["TRANSFER_IN", "GOOD", "duong-noi", 30 * K, 2],
    ]);
  });

  it("writes only Tốt lines when the site has no Mới", () => {
    const drafts = allocateTransfer({
      code: "CCT-2026-004",
      fromLocationId: "an-phu",
      toLocationId: "duong-noi",
      itemId: "CHEO1,7",
      milli: 40 * K,
      onSite: site(0, 260),
    });
    expect(drafts.map((d) => d.condition)).toEqual(["GOOD", "GOOD"]);
  });
});

describe("drawLabel", () => {
  it("shows where a count is drawn from", () => {
    expect(drawLabel(50 * K, site(20, 100), "PIECE")).toBe("20 Mới · 30 Tốt");
    expect(drawLabel(40 * K, site(0, 260), "PIECE")).toBe("40 Tốt");
    expect(drawLabel(0, site(0, 260), "PIECE")).toBe("–");
  });
});
