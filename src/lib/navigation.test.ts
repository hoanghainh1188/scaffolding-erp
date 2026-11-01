import { describe, expect, it } from "vitest";

import { dict } from "@/locales";
import { NAV_ITEMS, navItemsForRole } from "./navigation";

const labels = (role: Parameters<typeof navItemsForRole>[0]) =>
  navItemsForRole(role).map((item) => item.label);

describe("navigation", () => {
  it("lists nine desktop items in order", () => {
    expect(NAV_ITEMS.map((item) => [item.label, item.href])).toEqual([
      [dict.navigation.desktop.dashboard, "/dashboard"],
      [dict.navigation.desktop.purchasing, "/purchasing"],
      [dict.navigation.desktop.inventory, "/inventory"],
      [dict.navigation.desktop.repairs, "/repairs"],
      [dict.navigation.desktop.sales, "/sales"],
      [dict.navigation.desktop.receivables, "/receivables"],
      [dict.navigation.desktop.reports, "/reports"],
      [dict.navigation.desktop.catalog, "/catalog"],
      [dict.navigation.desktop.settings, "/settings"],
    ]);
  });

  it("shows all nine items to the director", () => {
    expect(labels("DIRECTOR")).toHaveLength(9);
  });

  it("hides receivables, reports and settings from sales", () => {
    expect(labels("SALES")).toEqual([
      dict.navigation.desktop.dashboard,
      dict.navigation.desktop.purchasing,
      dict.navigation.desktop.inventory,
      dict.navigation.desktop.repairs,
      dict.navigation.desktop.sales,
      dict.navigation.desktop.catalog,
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
