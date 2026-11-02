import { describe, expect, it } from "vitest";

import { diffFields } from "@/domain/activity-changes";

import {
  ALL_FIELD_SPECS,
  CUSTOMER_FIELDS,
  GROUP_FIELDS,
  ITEM_FIELDS,
  SITE_FIELDS,
  SUPPLIER_FIELDS,
} from "./fields";

describe("field specs (activity-log design D6, D7)", () => {
  const fields = ALL_FIELD_SPECS.flat();

  it("never compare a password, a token or a stamp", () => {
    expect(
      fields.filter((spec) =>
        /password|token|updated|created|searchText/i.test(spec.field),
      ),
    ).toEqual([]);
  });

  it("give every field a Vietnamese label", () => {
    expect(fields.every((spec) => spec.label.trim().length > 0)).toBe(true);
  });

  it("mask the supplier's CCCD and bank account", () => {
    const sensitive = Object.fromEntries(
      SUPPLIER_FIELDS.map((spec) => [spec.field, spec.sensitive]),
    );
    expect(sensitive.idNumber).toBe("ID_NUMBER");
    expect(sensitive.bankAccount).toBe("BANK_ACCOUNT");
    expect(
      SUPPLIER_FIELDS.filter((spec) => spec.sensitive).map((s) => s.field),
    ).toEqual(["idNumber", "bankAccount"]);
  });
});

describe("catalog-extensions fields", () => {
  const item = {
    name: "Thép ống D49",
    groupName: "Thép ống",
    unit: "METER" as const,
    aliases: [] as string[],
    standardWeightKg: "3.560",
    dailyRentalPrice: null,
    lostPrice: null,
    damagePrice: null,
    status: "ACTIVE",
  };

  it("compares old codes and writes the weight per unit", () => {
    expect(
      diffFields(ITEM_FIELDS, item, {
        ...item,
        aliases: ["ONG49"],
        standardWeightKg: "3.600",
      }),
    ).toEqual([
      { field: "aliases", label: "Mã cũ", before: null, after: "ONG49" },
      {
        field: "standardWeightKg",
        label: "Trọng lượng chuẩn",
        before: "3,56 kg/m",
        after: "3,6 kg/m",
      },
    ]);
  });

  it("compares group category, site province and sales staff by label", () => {
    expect(
      diffFields(
        GROUP_FIELDS,
        {
          name: "Que hàn",
          category: "EQUIPMENT",
          sortOrder: 0,
          status: "ACTIVE",
        },
        {
          name: "Que hàn",
          category: "MATERIAL",
          sortOrder: 0,
          status: "ACTIVE",
        },
      ),
    ).toEqual([
      {
        field: "category",
        label: "Phân loại",
        before: "Thiết bị",
        after: "Vật tư",
      },
    ]);
    const site = {
      name: "A",
      address: null,
      provinceName: null,
      status: "ACTIVE",
    };
    expect(
      diffFields(SITE_FIELDS, site, { ...site, provinceName: "Bắc Ninh" }),
    ).toMatchObject([{ field: "province", before: null, after: "Bắc Ninh" }]);
    const nt = {
      kind: "COMPANY",
      name: "Minh Phát",
      taxCode: null,
      contactName: null,
      phone: null,
      address: null,
      paymentTermsDays: 30,
      note: null,
      salesUserName: null,
      status: "ACTIVE",
    };
    expect(
      diffFields(CUSTOMER_FIELDS, nt, { ...nt, salesUserName: "Lương" }),
    ).toMatchObject([{ field: "salesUser", before: null, after: "Lương" }]);
  });
});
