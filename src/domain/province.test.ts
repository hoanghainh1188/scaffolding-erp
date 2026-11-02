import { describe, expect, it } from "vitest";

import {
  PROVINCES,
  PROVINCE_MESSAGES,
  REGION_LABELS,
  parseProvince,
  provincesIn,
  regionOf,
} from "./province";

describe("provinces", () => {
  it("has 34 provinces with distinct codes and names", () => {
    expect(PROVINCES).toHaveLength(34);
    expect(new Set(PROVINCES.map((p) => p.code)).size).toBe(34);
    expect(new Set(PROVINCES.map((p) => p.name)).size).toBe(34);
  });

  it("splits 15 / 11 / 8 by region", () => {
    expect(provincesIn("NORTH")).toHaveLength(15);
    expect(provincesIn("CENTRAL")).toHaveLength(11);
    expect(provincesIn("SOUTH")).toHaveLength(8);
  });

  it("puts Hà Nội, Đà Nẵng, TP. Hồ Chí Minh in the three regions", () => {
    expect(regionOf(parseProvince("Hà Nội"))).toBe("NORTH");
    expect(regionOf(parseProvince("Đà Nẵng"))).toBe("CENTRAL");
    expect(regionOf(parseProvince("TP. Hồ Chí Minh"))).toBe("SOUTH");
    expect(REGION_LABELS.SOUTH).toBe("Miền Nam");
  });

  it("puts Gia Lai and Lâm Đồng in Miền Trung", () => {
    expect(regionOf("GL")).toBe("CENTRAL");
    expect(regionOf("LD")).toBe("CENTRAL");
  });

  it("reads codes in any case and names without accents", () => {
    expect(parseProvince("hcm")).toBe("HCM");
    expect(parseProvince("tay ninh")).toBe("TNI");
  });

  it("refuses an empty or merged province", () => {
    expect(() => parseProvince("")).toThrow(PROVINCE_MESSAGES.required);
    expect(() => parseProvince(null)).toThrow(PROVINCE_MESSAGES.required);
    expect(() => parseProvince("Bà Rịa - Vũng Tàu")).toThrow(
      "Tỉnh/thành không hợp lệ",
    );
  });

  it("has no region for an unknown or missing province", () => {
    expect(regionOf(null)).toBeNull();
    expect(regionOf("BRVT")).toBeNull();
  });
});
