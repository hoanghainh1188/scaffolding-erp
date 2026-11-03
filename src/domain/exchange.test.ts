import { describe, expect, it } from "vitest";

import {
  assertExpectedLines,
  assertJoinable,
  cancelReason,
  type ExpectedLine,
} from "./exchange";

const K = 1000;
const line = (code: string, count: number): ExpectedLine => ({
  itemId: code,
  itemCode: code,
  unit: "PIECE",
  milli: count * K,
});
const onSite = new Map([["CHEO1,7", { NEW: 0, GOOD: 260 * K }]]);
const CONTRACT = "102026/ANPHAT-MINHPHAT";

describe("assertExpectedLines", () => {
  it("accepts what is on site", () => {
    expect(
      assertExpectedLines(CONTRACT, [line("CHEO1,7", 100)], onSite),
    ).toHaveLength(1);
  });

  it("refuses more than is on site", () => {
    expect(() =>
      assertExpectedLines(CONTRACT, [line("CHEO1,7", 300)], onSite),
    ).toThrow(
      "CHEO1,7: dự kiến nhận về (300 cái) nhiều hơn số đang ở công trình (260 cái).",
    );
  });

  it("needs something back", () => {
    expect(() => assertExpectedLines(CONTRACT, [], onSite)).toThrow(
      "Đổi hàng cần ít nhất một mã nhận về. Chỉ giao thêm thì tạo đợt xuất thường.",
    );
  });

  it("refuses an item not on site and 0", () => {
    expect(() =>
      assertExpectedLines(CONTRACT, [line("MAM1,6", 5)], onSite),
    ).toThrow(
      "MAM1,6 không có ở công trình của hợp đồng 102026/ANPHAT-MINHPHAT.",
    );
    expect(() =>
      assertExpectedLines(CONTRACT, [line("CHEO1,7", 0)], onSite),
    ).toThrow("CHEO1,7: số dự kiến nhận về phải lớn hơn 0.");
  });
});

describe("assertJoinable", () => {
  it("joins a waiting exchange of the same contract only", () => {
    expect(() =>
      assertJoinable({ contractId: "a", status: "WAITING" }, "a", null),
    ).not.toThrow();
    expect(() =>
      assertJoinable({ contractId: "a", status: "WAITING" }, "b", null),
    ).toThrow("Lần đổi hàng không thuộc hợp đồng này.");
    expect(() =>
      assertJoinable({ contractId: "a", status: "DONE" }, "a", "PTH-2026-080"),
    ).toThrow("Lần đổi hàng này đã nhận phiếu thu hồi PTH-2026-080.");
  });
});

describe("cancelReason", () => {
  it("needs a waiting exchange and a reason", () => {
    expect(cancelReason("WAITING", " Khách giữ ")).toBe("Khách giữ");
    expect(() => cancelReason("WAITING", "")).toThrow(
      "Bạn ghi lý do bỏ chờ thu hồi.",
    );
    expect(() => cancelReason("DONE", "x")).toThrow(
      "Lần đổi hàng không còn chờ thu hồi.",
    );
  });
});
