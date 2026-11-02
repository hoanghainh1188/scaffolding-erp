import { describe, expect, it } from "vitest";

import { DOCUMENT_TYPE_LABELS } from "./activity";
import {
  amendmentSummary,
  approvalSummary,
  contractSummary,
} from "./contract-summary";

describe("contract activity summaries", () => {
  it("summarises a new rental contract", () => {
    expect(
      contractSummary({
        type: "RENTAL",
        customer: "Minh Phát",
        site: "Trường THCS Dương Nội",
        itemCount: 4,
        value: 186_200_000,
      }),
    ).toBe(
      "Cho thuê · Minh Phát · Trường THCS Dương Nội · 4 mã hàng · 186.200.000 ₫",
    );
  });

  it("says a sale without site is picked up at the yard", () => {
    expect(
      contractSummary({
        type: "SALE",
        customer: "Anh Phạm Đức Long",
        site: null,
        itemCount: 1,
        value: null,
      }),
    ).toBe("Bán · Anh Phạm Đức Long · Nhận hàng tại bãi · 1 mã hàng");
  });

  it("writes the overdue debt and the reason on approval", () => {
    expect(
      approvalSummary(
        { amount: 96_000_000, days: 7 },
        "Minh Phát hẹn trả 96 triệu trước 05/11, đã gọi xác nhận.",
      ),
    ).toBe(
      "Nhà thầu nợ quá hạn 96.000.000 ₫ (7 ngày) · lý do: Minh Phát hẹn trả 96 triệu trước 05/11, đã gọi xác nhận.",
    );
    expect(approvalSummary({ amount: 0, days: 0 }, null)).toBe(
      "Hợp đồng có hiệu lực",
    );
  });

  it("summarises an approved amendment", () => {
    expect(
      amendmentSummary({
        effectiveFrom: "2026-12-15",
        type: "RENTAL",
        before: 1_330_000,
        after: 1_690_000,
      }),
    ).toBe("Hiệu lực 15/12/2026 · tiền thuê 1 ngày 1.330.000 ₫ → 1.690.000 ₫");
  });

  it("names the two document types for D18", () => {
    expect(DOCUMENT_TYPE_LABELS.CONTRACT).toBe("Hợp đồng");
    expect(DOCUMENT_TYPE_LABELS.CONTRACT_AMENDMENT).toBe("Phụ lục hợp đồng");
  });
});
