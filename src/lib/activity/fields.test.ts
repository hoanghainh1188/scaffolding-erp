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

  describe("sellers in the append-only log (personal-data-protection D8)", () => {
    const seller = {
      kind: "PERSON",
      name: "Anh Lê Văn Tâm",
      phone: "0912345678",
      address: "12 Trần Phú",
      taxCode: null,
      idNumber: null,
      bankAccountLast4: null,
      bankName: null,
      paymentTermsDays: 0,
      note: "Ghi chú A",
      status: "ACTIVE",
      dataNoticeVersion: null,
    };
    const changed = {
      ...seller,
      name: "Anh Tâm",
      phone: "0912345679",
      address: "13 Trần Phú",
      note: "Ghi chú B",
    };

    it("writes only that a person's fields changed", () => {
      const changes = diffFields(SUPPLIER_FIELDS, seller, changed);
      expect(changes.map((change) => change.field)).toEqual([
        "name",
        "phone",
        "address",
        "note",
      ]);
      expect(changes.every((change) => change.after === "(đã đổi)")).toBe(true);
      expect(JSON.stringify(changes)).not.toMatch(
        /Tâm|09123|Trần Phú|Ghi chú [AB]/,
      );
    });

    it("keeps a company's values", () => {
      const before = { ...seller, kind: "COMPANY" };
      const after = { ...changed, kind: "COMPANY" };
      expect(diffFields(SUPPLIER_FIELDS, before, after)[0]).toMatchObject({
        field: "name",
        before: "Anh Lê Văn Tâm",
        after: "Anh Tâm",
      });
    });

    it("hides values of a person who has just become a company", () => {
      const after = { ...changed, kind: "COMPANY" };
      const changes = diffFields(SUPPLIER_FIELDS, seller, after);
      expect(JSON.stringify(changes)).not.toMatch(/Tâm|09123|Trần Phú/);
    });

    it("records the notice version", () => {
      const changes = diffFields(SUPPLIER_FIELDS, seller, {
        ...seller,
        dataNoticeVersion: 1,
      });
      expect(changes).toEqual([
        {
          field: "dataNotice",
          label: "Ghi nhận thông báo",
          before: null,
          after: "Phiên bản 1",
        },
      ]);
    });
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
      diffFields(CUSTOMER_FIELDS, nt, { ...nt, salesUserName: "Khang" }),
    ).toMatchObject([{ field: "salesUser", before: null, after: "Khang" }]);
  });
});
