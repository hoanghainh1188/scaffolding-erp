import { describe, expect, it } from "vitest";

import {
  PERMISSIONS,
  can,
  canContract,
  parseContractScope,
  viewableContractTypes,
  type ContractScope,
  type Permission,
} from "./permissions";
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
  "catalog.read": ["DIRECTOR", "ACCOUNTANT", "SALES", "WAREHOUSE", "WORKSHOP"],
  "items.manage": ["DIRECTOR", "SALES"],
  "partners.manage": ["DIRECTOR", "SALES", "ACCOUNTANT"],
  "locations.manage": ["DIRECTOR"],
  "inventory.adjust": ["DIRECTOR", "ACCOUNTANT"],
  "inventory.approve": ["DIRECTOR"],
  "purchasing.manage": ["DIRECTOR", "SALES"],
  "receiving.manage": ["DIRECTOR", "WAREHOUSE"],
  "stock.lookup": ["DIRECTOR", "ACCOUNTANT", "SALES", "WAREHOUSE", "WORKSHOP"],
  "scrap-price.manage": ["DIRECTOR"],
  "repairs.manage": ["DIRECTOR", "ACCOUNTANT"],
  "stocktake.count": ["DIRECTOR", "WAREHOUSE"],
  "activity.view": ["DIRECTOR"],
  "company.read": ["DIRECTOR", "ACCOUNTANT", "SALES", "WAREHOUSE", "WORKSHOP"],
  "company.manage": ["DIRECTOR"],
  "contracts.rental.view": ["DIRECTOR", "ACCOUNTANT", "SALES"],
  "contracts.sale.view": ["DIRECTOR", "ACCOUNTANT", "SALES"],
  "contracts.rental.manage": ["DIRECTOR", "SALES"],
  "contracts.sale.manage": ["DIRECTOR", "SALES"],
  "contracts.approve": ["DIRECTOR"],
  "deliveries.pick": ["DIRECTOR", "WAREHOUSE"],
  "returns.receive": ["DIRECTOR", "WAREHOUSE"],
  "compensations.approve": ["DIRECTOR"],
  "buybacks.approve": ["DIRECTOR"],
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

  it("gives the phone roles only reading, and the storekeeper receiving, counting and picking", () => {
    const phone: readonly Permission[] = [
      "catalog.read",
      "stock.lookup",
      "company.read",
    ];
    for (const permission of Object.keys(PERMISSIONS) as Permission[]) {
      if (phone.includes(permission)) continue;
      expect(can("WAREHOUSE", permission)).toBe(
        permission === "receiving.manage" ||
          permission === "stocktake.count" ||
          permission === "deliveries.pick" ||
          permission === "returns.receive",
      );
      expect(can("WORKSHOP", permission)).toBe(false);
    }
  });
});

describe("canContract", () => {
  const sales = (contractScope: ContractScope) =>
    ({ role: "SALES", contractScope }) as const;

  it("lets a rental-only seller view and edit rental, nothing of sale", () => {
    expect(canContract(sales("RENTAL"), "RENTAL", "view")).toBe(true);
    expect(canContract(sales("RENTAL"), "RENTAL", "manage")).toBe(true);
    expect(canContract(sales("RENTAL"), "SALE", "view")).toBe(false);
    expect(canContract(sales("RENTAL"), "SALE", "manage")).toBe(false);
  });

  it("lets a sale-only seller do the opposite", () => {
    expect(canContract(sales("SALE"), "SALE", "manage")).toBe(true);
    expect(canContract(sales("SALE"), "RENTAL", "view")).toBe(false);
  });

  it("lets a seller with both scopes work on both", () => {
    expect(viewableContractTypes(sales("ALL"))).toEqual(["RENTAL", "SALE"]);
    expect(canContract(sales("ALL"), "SALE", "manage")).toBe(true);
  });

  it("ignores the scope for the accountant: views both, edits none", () => {
    const accountant = { role: "ACCOUNTANT", contractScope: "SALE" } as const;
    expect(viewableContractTypes(accountant)).toEqual(["RENTAL", "SALE"]);
    expect(canContract(accountant, "RENTAL", "manage")).toBe(false);
  });

  it("gives the director everything, whatever the stored scope", () => {
    const director = { role: "DIRECTOR", contractScope: "RENTAL" } as const;
    expect(canContract(director, "SALE", "manage")).toBe(true);
  });

  it.each(["WAREHOUSE", "WORKSHOP"] as const)(
    "gives %s no contract access",
    (role) => {
      expect(viewableContractTypes({ role, contractScope: "ALL" })).toEqual([]);
    },
  );

  it("lets only the director approve", () => {
    expect(ROLES.filter((role) => can(role, "contracts.approve"))).toEqual([
      "DIRECTOR",
    ]);
  });

  it("lets the director and the storekeeper pick deliveries", () => {
    expect(ROLES.filter((role) => can(role, "deliveries.pick"))).toEqual([
      "DIRECTOR",
      "WAREHOUSE",
    ]);
  });

  it("lets the director and the storekeeper receive returns, only the director approve compensation", () => {
    expect(ROLES.filter((role) => can(role, "returns.receive"))).toEqual([
      "DIRECTOR",
      "WAREHOUSE",
    ]);
    expect(ROLES.filter((role) => can(role, "compensations.approve"))).toEqual([
      "DIRECTOR",
    ]);
    expect(ROLES.filter((role) => can(role, "buybacks.approve"))).toEqual([
      "DIRECTOR",
    ]);
  });

  it("reads an unknown stored scope as ALL", () => {
    expect(parseContractScope("RENTAL")).toBe("RENTAL");
    expect(parseContractScope("ANY")).toBe("ALL");
    expect(parseContractScope(null)).toBe("ALL");
  });
});
