import { describe, expect, it } from "vitest";

import type { BusinessDate } from "./business-date";
import {
  allocateBuyBack,
  assertBuyBackLines,
  buyBackDueDate,
  buyBackTotal,
  isOffContractPrice,
  requireBuyBackText,
  transition,
  type BuyBackLineInput,
} from "./buy-back";

const K = 1000;
const CONTRACT = "102026/ANPHAT-MINHPHAT";
const site = (fresh: number, good: number) => ({
  NEW: fresh * K,
  GOOD: good * K,
});
const onSite = new Map([
  ["TR16", site(0, 120)],
  ["BCH", site(0, 300)],
]);
const line = (
  code: string,
  count: number,
  unitPrice: number | null,
  contractPrice: number | null = unitPrice,
): BuyBackLineInput => ({
  itemId: code,
  itemCode: code,
  unit: "PIECE",
  milli: count * K,
  unitPrice,
  contractPrice,
});

describe("buyBackTotal", () => {
  it("adds the lines of D6c", () => {
    expect(
      buyBackTotal([
        { milli: 20 * K, unitPrice: 35_000 },
        { milli: 50 * K, unitPrice: 12_000 },
      ]),
    ).toBe(1_300_000);
  });

  it("keeps a line at 0 ₫", () => {
    expect(buyBackTotal([{ milli: 5 * K, unitPrice: 0 }])).toBe(0);
  });
});

describe("isOffContractPrice", () => {
  it("marks a price that differs from the contract", () => {
    expect(
      isOffContractPrice({ unitPrice: 35_000, contractPrice: 35_000 }),
    ).toBe(false);
    expect(
      isOffContractPrice({ unitPrice: 30_000, contractPrice: 35_000 }),
    ).toBe(true);
    expect(isOffContractPrice({ unitPrice: 0, contractPrice: 12_000 })).toBe(
      true,
    );
    expect(isOffContractPrice({ unitPrice: 30_000, contractPrice: null })).toBe(
      true,
    );
  });
});

describe("assertBuyBackLines", () => {
  it("accepts the lines of D6c, a 0 ₫ price too", () => {
    expect(
      assertBuyBackLines(
        CONTRACT,
        [line("TR16", 20, 35_000), line("BCH", 5, 0, 12_000)],
        onSite,
      ),
    ).toHaveLength(2);
  });

  it("refuses more than is at the site", () => {
    expect(() =>
      assertBuyBackLines(CONTRACT, [line("TR16", 130, 35_000)], onSite),
    ).toThrow(
      "TR16: số mua (130 cái) nhiều hơn số đang ở công trình (120 cái).",
    );
  });

  it("words the refusal for the director at approval", () => {
    expect(() =>
      assertBuyBackLines(
        CONTRACT,
        [line("TR16", 20, 35_000)],
        new Map([["TR16", site(0, 10)]]),
        true,
      ),
    ).toThrow(
      "TR16: số mua (20 cái) nhiều hơn số đang ở công trình (10 cái). Kinh doanh cần sửa phiếu.",
    );
  });

  it("refuses an item not at the site", () => {
    expect(() =>
      assertBuyBackLines(CONTRACT, [line("MAM1,6", 5, 380_000)], onSite),
    ).toThrow(
      "MAM1,6 không có ở công trình của hợp đồng 102026/ANPHAT-MINHPHAT.",
    );
  });

  it("needs a price when the contract has no lost price", () => {
    expect(() =>
      assertBuyBackLines(CONTRACT, [line("TR16", 20, null, null)], onSite),
    ).toThrow("TR16 chưa có giá mất trên hợp đồng. Bạn nhập đơn giá mua lại.");
  });

  it("refuses 0 pieces, fractions and an empty note", () => {
    expect(() =>
      assertBuyBackLines(CONTRACT, [line("TR16", 0, 35_000)], onSite),
    ).toThrow("TR16: số mua phải lớn hơn 0.");
    expect(() =>
      assertBuyBackLines(
        CONTRACT,
        [{ ...line("TR16", 0, 35_000), milli: 2_500 }],
        onSite,
      ),
    ).toThrow("TR16 tính theo cái, số lượng phải là số nguyên");
    expect(() => assertBuyBackLines(CONTRACT, [], onSite)).toThrow(
      "Phiếu mua lại chưa có hàng nào.",
    );
  });
});

describe("buyBackDueDate", () => {
  it("adds the payment terms", () => {
    expect(buyBackDueDate("2026-11-05" as BusinessDate, 30)).toBe("2026-12-05");
  });

  it("crosses a year", () => {
    expect(buyBackDueDate("2026-12-20" as BusinessDate, 30)).toBe("2027-01-19");
  });
});

describe("transition", () => {
  it("approves or rejects a pending note once", () => {
    expect(transition("PENDING", "APPROVE")).toBe("APPROVED");
    expect(transition("PENDING", "REJECT")).toBe("REJECTED");
    expect(transition("PENDING", "EDIT")).toBe("PENDING");
    expect(() => transition("APPROVED", "EDIT")).toThrow(
      "Phiếu mua lại đã duyệt nên không sửa được.",
    );
    expect(() => transition("REJECTED", "APPROVE")).toThrow();
  });

  it("needs a reason", () => {
    expect(() =>
      requireBuyBackText(" ", "Bạn ghi lý do khách mua lại."),
    ).toThrow("Bạn ghi lý do khách mua lại.");
  });
});

describe("allocateBuyBack", () => {
  it("sells Mới first, then Tốt, at the site", () => {
    const drafts = allocateBuyBack({
      code: "MLA-2026-003",
      siteLocationId: "an-phu",
      itemId: "TR16",
      milli: 20 * K,
      onSite: site(5, 115),
    });
    expect(
      drafts.map((d) => [d.movement, d.condition, d.quantityMilli]),
    ).toEqual([
      ["SALE_OUT", "NEW", -5 * K],
      ["SALE_OUT", "GOOD", -15 * K],
    ]);
    expect(drafts.every((d) => d.locationId === "an-phu")).toBe(true);
  });
});
