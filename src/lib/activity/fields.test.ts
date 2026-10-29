import { describe, expect, it } from "vitest";

import { ALL_FIELD_SPECS, SUPPLIER_FIELDS } from "./fields";

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
