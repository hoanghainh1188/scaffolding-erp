import { describe, expect, it } from "vitest";

import {
  approvedSummary,
  createdCompensationSummary,
  postedReturnSummary,
  priceChangeText,
  rejectedSummary,
  returnedText,
} from "./return-summary";

const pieces = (count: number) => [
  { unit: "PIECE" as const, milli: count * 1000 },
];

describe("return texts", () => {
  it("says what came back and what was lost", () => {
    expect(returnedText(pieces(100), pieces(2))).toBe("trả 100 cái, mất 2 cái");
    expect(returnedText([], pieces(20))).toBe("mất 20 cái");
    expect(
      postedReturnSummary("An Phú – Block B", pieces(100), pieces(2)),
    ).toBe("An Phú – Block B · trả 100 cái, mất 2 cái");
  });
});

describe("compensation log texts", () => {
  it("matches the spec rows", () => {
    expect(
      approvedSummary(
        3_500_000,
        415_000,
        "Khách quen, bớt phần chéo cong",
        null,
      ),
    ).toBe("3.500.000 ₫ (giảm 415.000 ₫: Khách quen, bớt phần chéo cong)");
    expect(approvedSummary(3_915_000, 0, null, "Khách hứa trả tuần sau")).toBe(
      "3.915.000 ₫ · nợ quá hạn: Khách hứa trả tuần sau",
    );
    expect(priceChangeText("MAM1,6", "LOST", null, 380_000)).toBe(
      "đơn giá MAM1,6 Mất: trống → 380.000 ₫",
    );
    expect(createdCompensationSummary("PTH-2026-071", 3_915_000, 6)).toBe(
      "Từ PTH-2026-071 · 3.915.000 ₫ · 6 dòng",
    );
    expect(rejectedSummary(3_915_000, "Hàng hỏng do bãi xếp")).toBe(
      'Không thu 3.915.000 ₫ · Lý do: "Hàng hỏng do bãi xếp"',
    );
  });
});
