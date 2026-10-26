import { describe, expect, it } from "vitest";

import {
  DISPLAY_DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  STORED_DOCUMENT_STATUSES,
  assertStorableStatus,
} from "./document-status";

describe("document statuses", () => {
  it("stores only four statuses", () => {
    expect(STORED_DOCUMENT_STATUSES).toEqual([
      "DRAFT",
      "PENDING_APPROVAL",
      "IN_PROGRESS",
      "DONE",
    ]);
  });

  it("adds OVERDUE for display only", () => {
    expect(DISPLAY_DOCUMENT_STATUSES).toContain("OVERDUE");
    expect(
      DISPLAY_DOCUMENT_STATUSES.map((s) => DOCUMENT_STATUS_LABELS[s]),
    ).toEqual(["Nháp", "Chờ duyệt", "Đang xử lý", "Hoàn thành", "Quá hạn"]);
  });

  it("refuses to store OVERDUE", () => {
    expect(() => assertStorableStatus("OVERDUE")).toThrow(
      "Quá hạn là trạng thái tính ra, không được lưu",
    );
    expect(assertStorableStatus("DONE")).toBe("DONE");
  });
});
