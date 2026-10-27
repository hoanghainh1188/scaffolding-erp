import { describe, expect, it } from "vitest";

import { PERMISSIONS, can, type Permission } from "./permissions";
import { ROLES, type Role } from "./role";

// Expected table, written out by hand so a typo in PERMISSIONS shows up.
const ALLOWED: Readonly<Record<Permission, readonly Role[]>> = {
  "dashboard.view": ["DIRECTOR", "ACCOUNTANT", "SALES"],
  "purchasing.view": ["DIRECTOR", "ACCOUNTANT", "SALES"],
  "inventory.view": ["DIRECTOR", "ACCOUNTANT", "SALES"],
  "repairs.view": ["DIRECTOR", "ACCOUNTANT", "SALES"],
  "sales.view": ["DIRECTOR", "ACCOUNTANT", "SALES"],
  "receivables.view": ["DIRECTOR", "ACCOUNTANT"],
  "reports.view": ["DIRECTOR"],
  "catalog.view": ["DIRECTOR", "ACCOUNTANT", "SALES"],
  "settings.view": ["DIRECTOR"],
  "users.manage": ["DIRECTOR"],
};

const PAIRS = (Object.keys(PERMISSIONS) as Permission[]).flatMap((permission) =>
  ROLES.map((role) => [role, permission] as const),
);

describe("can", () => {
  it("covers exactly the permissions listed in the expected table", () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual(
      Object.keys(ALLOWED).sort(),
    );
  });

  it.each(PAIRS)("%s / %s matches the table", (role, permission) => {
    expect(can(role, permission)).toBe(ALLOWED[permission].includes(role));
  });

  it("lets only Giám đốc manage users", () => {
    expect(ROLES.filter((role) => can(role, "users.manage"))).toEqual([
      "DIRECTOR",
    ]);
  });

  it("gives the phone roles no desktop page", () => {
    for (const permission of Object.keys(PERMISSIONS) as Permission[]) {
      expect(can("WAREHOUSE", permission)).toBe(false);
      expect(can("WORKSHOP", permission)).toBe(false);
    }
  });
});
