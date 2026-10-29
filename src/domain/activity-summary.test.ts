import { describe, expect, it } from "vitest";

import { capChanges } from "./activity-changes";
import {
  changePhrase,
  changeSummary,
  clampSummary,
  countText,
  joinParts,
  reasonSummary,
} from "./activity-summary";

const price = {
  field: "lines.GG-K17.unitPrice",
  label: "Đơn giá GG-K17",
  before: "190.000 ₫",
  after: "185.000 ₫",
};

const change = (i: number) => ({
  field: `f${i}`,
  label: `Trường ${i}`,
  before: "a",
  after: "b",
});

describe("changeSummary", () => {
  it("writes one change like D18", () => {
    expect(changeSummary([price])).toBe(
      "Đơn giá GG-K17: 190.000 ₫ → 185.000 ₫",
    );
  });

  it("shows the first two and counts the rest", () => {
    expect(changeSummary([price, change(1), change(2), change(3)])).toBe(
      "Đơn giá GG-K17: 190.000 ₫ → 185.000 ₫; Trường 1: a → b … và 2 thay đổi khác",
    );
  });

  it("counts changes folded by capChanges", () => {
    const capped = capChanges(Array.from({ length: 60 }, (_, i) => change(i)));
    expect(changeSummary(capped)).toMatch(/… và 58 thay đổi khác$/);
  });

  it("writes a missing side as a dash", () => {
    expect(
      changePhrase({
        field: "lines.PK-KU",
        label: "Dòng PK-KU",
        before: null,
        after: "50 cái × 40.000 ₫",
      }),
    ).toBe("Dòng PK-KU: – → 50 cái × 40.000 ₫");
  });
});

describe("summary sentences", () => {
  it("joins parts with a middle dot, skipping empty ones", () => {
    expect(
      joinParts("Hòa Phát mẫu", countText(5, "mã hàng"), null, "52.942.500 ₫"),
    ).toBe("Hòa Phát mẫu · 5 mã hàng · 52.942.500 ₫");
    expect(joinParts("Ghi sổ 5 dòng điều chỉnh", "−2.788.056 ₫")).toBe(
      "Ghi sổ 5 dòng điều chỉnh · −2.788.056 ₫",
    );
  });

  it("quotes a reason", () => {
    expect(reasonSummary("Ghi rõ số phiếu thu hồi")).toBe(
      'Lý do: "Ghi rõ số phiếu thu hồi"',
    );
  });

  it("writes counts the Vietnamese way", () => {
    expect(countText(1250, "dòng")).toBe("1.250 dòng");
  });
});

describe("clampSummary", () => {
  it("cuts 400 characters to 300 ending in …", () => {
    const cut = clampSummary("ư".repeat(400));
    expect(Array.from(cut)).toHaveLength(300);
    expect(cut.endsWith("…")).toBe(true);
  });

  it("keeps short text, folds spaces and never stores empty text", () => {
    expect(clampSummary("  Đăng nhập   thành công ")).toBe(
      "Đăng nhập thành công",
    );
    expect(clampSummary("   ")).toBe("–");
  });
});
