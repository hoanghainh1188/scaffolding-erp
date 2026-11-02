import { describe, expect, it } from "vitest";

import {
  amendmentTransition,
  approvalReason,
  checkSubmittable,
  CONTRACT_MESSAGES,
  CONTRACT_STATUSES,
  editBlocker,
  requiredReason,
  statusGroup,
  transition,
  type ContractCommand,
  type ContractStatus,
} from "./contract";

const state = (status: ContractStatus, hasDeliveries = false) => ({
  status,
  hasDeliveries,
});

// Every allowed change (design D1); anything else must throw.
const ALLOWED: readonly [ContractStatus, ContractCommand, ContractStatus][] = [
  ["DRAFT", "SUBMIT", "PENDING"],
  ["PENDING", "APPROVE", "APPROVED"],
  ["PENDING", "RETURN", "DRAFT"],
  ["DRAFT", "CANCEL", "CANCELLED"],
  ["APPROVED", "CANCEL", "CANCELLED"],
  ["APPROVED", "START", "ACTIVE"],
  ["ACTIVE", "CLOSE", "CLOSED"],
];

const COMMANDS: readonly ContractCommand[] = [
  "SUBMIT",
  "APPROVE",
  "RETURN",
  "CANCEL",
  "START",
  "CLOSE",
];

describe("contract transition", () => {
  const pairs = CONTRACT_STATUSES.flatMap((status) =>
    COMMANDS.map((command) => [status, command] as const),
  );

  it.each(pairs)("%s + %s follows the table", (status, command) => {
    const allowed = ALLOWED.find(
      ([from, verb]) => from === status && verb === command,
    );
    if (allowed) {
      expect(transition(state(status), command)).toBe(allowed[2]);
    } else {
      expect(() => transition(state(status), command)).toThrow();
    }
  });

  it("says why an approved contract cannot be sent again", () => {
    expect(() => transition(state("APPROVED"), "SUBMIT")).toThrow(
      CONTRACT_MESSAGES.submitApproved,
    );
  });

  it("answers a second approval", () => {
    expect(() => transition(state("APPROVED"), "APPROVE")).toThrow(
      "Hợp đồng đã được duyệt.",
    );
  });

  it("refuses to cancel an approved contract with deliveries", () => {
    expect(() => transition(state("APPROVED", true), "CANCEL")).toThrow(
      "Hợp đồng đã xuất hàng nên không hủy được.",
    );
  });

  it("puts each status in its D4 tile", () => {
    expect(statusGroup("DRAFT")).toBeNull();
    expect(statusGroup("PENDING")).toBe("pending");
    expect(statusGroup("APPROVED")).toBe("active");
    expect(statusGroup("ACTIVE")).toBe("active");
    expect(statusGroup("CLOSED")).toBe("ended");
    expect(statusGroup("CANCELLED")).toBe("ended");
  });

  it("lets only drafts be edited", () => {
    expect(editBlocker("DRAFT")).toBeNull();
    expect(editBlocker("APPROVED")).toBe(CONTRACT_MESSAGES.editApproved);
    expect(editBlocker("PENDING")).toBe(CONTRACT_MESSAGES.editSent);
  });
});

describe("approval reason (0.2 #15)", () => {
  const overdue = { amount: 96_000_000, days: 7 };

  it("requires a reason while the customer is overdue", () => {
    expect(() => approvalReason(overdue, "")).toThrow(
      "Nhà thầu đang nợ quá hạn 96.000.000 ₫ (7 ngày). Bạn ghi lý do vẫn duyệt.",
    );
  });

  it("treats blank text as no reason", () => {
    expect(() => approvalReason(overdue, "   ")).toThrow();
  });

  it("keeps the trimmed reason", () => {
    expect(
      approvalReason(
        overdue,
        " Minh Phát hẹn trả 96 triệu trước 05/11, đã gọi xác nhận. ",
      ),
    ).toBe("Minh Phát hẹn trả 96 triệu trước 05/11, đã gọi xác nhận.");
  });

  it("needs nothing when nothing is overdue", () => {
    expect(approvalReason({ amount: 0, days: 0 }, undefined)).toBeNull();
  });

  it("refuses more than 500 characters", () => {
    expect(() => approvalReason(overdue, "x".repeat(501))).toThrow(
      "Lý do dài tối đa 500 ký tự.",
    );
    expect(approvalReason(overdue, "x".repeat(500))).toHaveLength(500);
  });

  it("requires a reason to return", () => {
    expect(() => requiredReason(" ", CONTRACT_MESSAGES.returnReason)).toThrow(
      "Bạn ghi lý do để người lập biết cần sửa gì.",
    );
  });
});

describe("checkSubmittable", () => {
  const rental = {
    type: "RENTAL" as const,
    endDate: "2027-03-21",
    lines: [{ itemCode: "H1,7", price: 1200 }],
    compensations: [
      { itemCode: "H1,7", lostPrice: 450_000, damagePrice: 50_000 },
    ],
  };

  it("passes a complete rental draft", () => {
    expect(() => checkSubmittable(rental)).not.toThrow();
  });

  it("refuses a draft without lines", () => {
    expect(() => checkSubmittable({ ...rental, lines: [] })).toThrow(
      CONTRACT_MESSAGES.noLines,
    );
  });

  it("refuses a line without price", () => {
    expect(() =>
      checkSubmittable({
        ...rental,
        lines: [{ itemCode: "PL-SAT", price: null }],
      }),
    ).toThrow("Mã PL-SAT chưa có giá thuê. Bạn nhập giá cho dòng này.");
  });

  it("refuses a missing compensation price, 0 ₫ is fine", () => {
    expect(() =>
      checkSubmittable({
        ...rental,
        compensations: [
          { itemCode: "H1,7", lostPrice: 450_000, damagePrice: null },
        ],
      }),
    ).toThrow(CONTRACT_MESSAGES.noCompensation("H1,7"));
    expect(() =>
      checkSubmittable({
        ...rental,
        compensations: [{ itemCode: "H1,7", lostPrice: 0, damagePrice: 0 }],
      }),
    ).not.toThrow();
  });

  it("refuses a rental without an end date", () => {
    expect(() => checkSubmittable({ ...rental, endDate: null })).toThrow(
      CONTRACT_MESSAGES.noEndDate,
    );
  });

  it("does not ask a sale for compensation or an end date", () => {
    expect(() =>
      checkSubmittable({
        type: "SALE",
        endDate: null,
        lines: [{ itemCode: "H1,7", price: 320_000 }],
        compensations: [],
      }),
    ).not.toThrow();
  });
});

describe("amendment transition", () => {
  it("runs draft → pending → approved", () => {
    expect(amendmentTransition("APPROVED", "DRAFT", "SUBMIT")).toBe("PENDING");
    expect(amendmentTransition("ACTIVE", "PENDING", "APPROVE")).toBe(
      "APPROVED",
    );
    expect(amendmentTransition("APPROVED", "PENDING", "RETURN")).toBe("DRAFT");
    expect(amendmentTransition("APPROVED", "PENDING", "CANCEL")).toBe(
      "CANCELLED",
    );
  });

  it("refuses every command once the contract is cancelled", () => {
    expect(() =>
      amendmentTransition("CANCELLED", "PENDING", "APPROVE"),
    ).toThrow("Hợp đồng đã hủy nên không duyệt phụ lục được.");
    expect(() => amendmentTransition("CANCELLED", "DRAFT", "SUBMIT")).toThrow(
      "Hợp đồng đã hủy nên không gửi duyệt phụ lục được.",
    );
  });

  it("refuses to edit an approved amendment", () => {
    expect(() => amendmentTransition("APPROVED", "APPROVED", "EDIT")).toThrow(
      "Phụ lục đã duyệt không sửa được. Bạn lập phụ lục mới.",
    );
  });
});
