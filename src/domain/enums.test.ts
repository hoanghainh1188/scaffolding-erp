import { describe, expect, it } from "vitest";

import { CONDITIONS, CONDITION_LABELS, isSellableCondition } from "./condition";
import { DomainValueError } from "./errors";
import { LOCATION_TYPE_LABELS, LOCATION_TYPES } from "./location-type";
import { ROLES, ROLE_LABELS, defaultSurfaceForRole, parseRole } from "./role";

describe("conditions", () => {
  it("has exactly four conditions with Vietnamese labels", () => {
    expect(CONDITIONS).toEqual(["NEW", "GOOD", "NEEDS_REPAIR", "SCRAP"]);
    expect(CONDITIONS.map((c) => CONDITION_LABELS[c])).toEqual([
      "Mới",
      "Tốt",
      "Chờ sửa",
      "Phế liệu",
    ]);
  });

  it("only NEW and GOOD can be sold or rented", () => {
    expect(CONDITIONS.filter(isSellableCondition)).toEqual(["NEW", "GOOD"]);
  });
});

describe("roles", () => {
  it("has exactly five roles with Vietnamese labels", () => {
    expect(ROLES.map((r) => ROLE_LABELS[r])).toEqual([
      "Giám đốc",
      "Kế toán",
      "Kinh doanh",
      "Thủ kho",
      "Xưởng",
    ]);
  });

  it("parses a valid role", () => {
    expect(parseRole("SALES")).toBe("SALES");
  });

  it("rejects an unknown role and lists the allowed ones", () => {
    expect(() => parseRole("ADMIN")).toThrow(DomainValueError);
    expect(() => parseRole("ADMIN")).toThrow(
      "DIRECTOR, ACCOUNTANT, SALES, WAREHOUSE, WORKSHOP",
    );
  });

  it("sends warehouse and workshop to mobile, others to desktop", () => {
    expect(defaultSurfaceForRole("WAREHOUSE")).toBe("MOBILE");
    expect(defaultSurfaceForRole("WORKSHOP")).toBe("MOBILE");
    expect(defaultSurfaceForRole("DIRECTOR")).toBe("DESKTOP");
    expect(defaultSurfaceForRole("ACCOUNTANT")).toBe("DESKTOP");
    expect(defaultSurfaceForRole("SALES")).toBe("DESKTOP");
  });
});

describe("location types", () => {
  it("labels yard, workshop and site", () => {
    expect(LOCATION_TYPES.map((t) => LOCATION_TYPE_LABELS[t])).toEqual([
      "Tại bãi",
      "Tại xưởng",
      "Tại công trình",
    ]);
  });
});
