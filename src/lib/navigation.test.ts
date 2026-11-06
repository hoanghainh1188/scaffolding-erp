import { describe, expect, it } from "vitest";

import { isNavActive, NAV_ITEMS, navItemsForRole } from "./navigation";

const labels = (role: Parameters<typeof navItemsForRole>[0]) =>
  navItemsForRole(role).map((item) => item.label);

describe("navigation", () => {
  it("lists nine desktop items in order", () => {
    expect(NAV_ITEMS.map((item) => [item.label, item.href])).toEqual([
      ["Tổng quan", "/dashboard"],
      ["Mua hàng", "/purchasing"],
      ["Kho", "/inventory"],
      ["Sửa chữa", "/repairs"],
      ["Cho thuê & Bán", "/sales"],
      ["Công nợ", "/receivables"],
      ["Báo cáo", "/reports"],
      ["Danh mục", "/catalog"],
      ["Cài đặt", "/settings"],
    ]);
  });

  it("shows all nine items to the director", () => {
    expect(labels("DIRECTOR")).toHaveLength(9);
  });

  it("hides receivables, reports and settings from sales", () => {
    expect(labels("SALES")).toEqual([
      "Tổng quan",
      "Mua hàng",
      "Kho",
      "Sửa chữa",
      "Cho thuê & Bán",
      "Danh mục",
    ]);
  });

  it("shows receivables but not reports or settings to the accountant", () => {
    const items = labels("ACCOUNTANT");
    expect(items).toContain("Công nợ");
    expect(items).not.toContain("Báo cáo");
    expect(items).not.toContain("Cài đặt");
  });

  it("has no desktop menu for mobile roles", () => {
    expect(navItemsForRole("WAREHOUSE")).toEqual([]);
    expect(navItemsForRole("WORKSHOP")).toEqual([]);
  });
});

describe("isNavActive", () => {
  const debts = NAV_ITEMS.find((item) => item.href === "/receivables");

  it("marks Công nợ on Phải thu and Phải trả (payables design D8)", () => {
    if (!debts) throw new Error("no Công nợ item");
    expect(isNavActive("/receivables", debts)).toBe(true);
    expect(isNavActive("/payables", debts)).toBe(true);
    expect(isNavActive("/receivables/billing", debts)).toBe(true);
    expect(isNavActive("/purchasing", debts)).toBe(false);
    expect(isNavActive("/payablesx", debts)).toBe(false);
  });
});
