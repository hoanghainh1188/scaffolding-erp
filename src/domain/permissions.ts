import type { ContractType } from "./contract";
import type { Role } from "./role";

const OFFICE = ["DIRECTOR", "ACCOUNTANT", "SALES"] as const;
const EVERYONE = [
  "DIRECTOR",
  "ACCOUNTANT",
  "SALES",
  "WAREHOUSE",
  "WORKSHOP",
] as const;

/**
 * The one table of who may do what (design D7). The desktop menu and every
 * server-side check read it; later changes add their permissions here
 * instead of naming roles anywhere else.
 */
export const PERMISSIONS = {
  "dashboard.view": OFFICE,
  "purchasing.view": OFFICE,
  "inventory.view": OFFICE,
  "repairs.view": OFFICE,
  "sales.view": OFFICE,
  "receivables.view": ["DIRECTOR", "ACCOUNTANT"],
  "reports.view": ["DIRECTOR"],
  "catalog.view": OFFICE,
  "settings.view": ["DIRECTOR"],
  "users.manage": ["DIRECTOR"],
  // master-data design D9: everyone reads the catalog (the phone screens of
  // later changes need it); writes are split by who owns the data.
  "catalog.read": EVERYONE,
  "items.manage": ["DIRECTOR", "SALES"],
  "partners.manage": ["DIRECTOR", "SALES", "ACCOUNTANT"],
  "locations.manage": ["DIRECTOR"],
  // inventory-ledger design D8: the accountant keeps the books and drafts
  // adjustments and opening balances; only the director approves them.
  // Viewing stock uses inventory.view above.
  "inventory.adjust": ["DIRECTOR", "ACCOUNTANT"],
  "inventory.approve": ["DIRECTOR"],
  // purchase-orders design D12: sales buys, the director oversees; the
  // accountant pays sellers and reads orders through purchasing.view.
  "purchasing.manage": ["DIRECTOR", "SALES"],
  // goods-receipt design D13: the storekeeper receives on the phone; the
  // director may stand in. Office roles read receipts through purchasing.view.
  "receiving.manage": ["DIRECTOR", "WAREHOUSE"],
  // M2 shows stock quantities (no cost) to anyone holding a phone.
  "stock.lookup": EVERYONE,
  "scrap-price.manage": ["DIRECTOR"],
  // simple-repair design D4: the accountant keeps the books (repair cost,
  // damage loss); office roles read slips through repairs.view.
  "repairs.manage": ["DIRECTOR", "ACCOUNTANT"],
  // stocktake design D11: the storekeeper counts yards and the workshop on
  // the phone; the director may stand in. Office roles read results through
  // inventory.view; approving uses inventory.approve.
  "stocktake.count": ["DIRECTOR", "WAREHOUSE"],
  // activity-log design D11: only the director reads the activity log; no
  // permission writes or deletes it (services log through logActivity).
  "activity.view": ["DIRECTOR"],
  // company-settings spec K10: all roles read profile for print and headers;
  // only the director updates company info.
  "company.read": EVERYONE,
  "company.manage": ["DIRECTOR"],
  // contracts design D8: rental and sale contracts are checked apart; the
  // accountant reads both (billing, receivables), only the director
  // approves. canContract below adds the scope of a SALES account.
  "contracts.rental.view": OFFICE,
  "contracts.sale.view": OFFICE,
  "contracts.rental.manage": ["DIRECTOR", "SALES"],
  "contracts.sale.manage": ["DIRECTOR", "SALES"],
  "contracts.approve": ["DIRECTOR"],
  // deliveries design D11: the storekeeper picks and confirms the truck
  // leaving; the director may stand in. Planning a batch uses canContract.
  "deliveries.pick": ["DIRECTOR", "WAREHOUSE"],
  // returns-and-compensation design D11: the storekeeper counts returns on
  // the phone; the director may stand in. Office roles read return notes,
  // compensation notes and photos through canContract("RENTAL", "view").
  "returns.receive": ["DIRECTOR", "WAREHOUSE"],
  "compensations.approve": ["DIRECTOR"],
  // site-operations design D7: only the director approves a buy-back; the
  // office makes and edits it through canContract("RENTAL", "manage").
  "buybacks.approve": ["DIRECTOR"],
} as const satisfies Readonly<Record<string, readonly Role[]>>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Which contract types a SALES account works on (0.2 #51). */
export const CONTRACT_SCOPES = ["ALL", "RENTAL", "SALE"] as const;
export type ContractScope = (typeof CONTRACT_SCOPES)[number];

export const CONTRACT_SCOPE_LABELS: Readonly<Record<ContractScope, string>> = {
  ALL: "Cả hai",
  RENTAL: "Chỉ cho thuê",
  SALE: "Chỉ bán",
};

/** Anything unknown reads as ALL, the column default. */
export function parseContractScope(value: unknown): ContractScope {
  return (CONTRACT_SCOPES as readonly unknown[]).includes(value)
    ? (value as ContractScope)
    : "ALL";
}

export type ContractAction = "view" | "manage";

export interface ContractUser {
  role: Role;
  contractScope: ContractScope;
}

/**
 * The one check for a contract of a type (design D8): the role's permission
 * and, for SALES only, the account's scope.
 */
export function canContract(
  user: ContractUser,
  type: ContractType,
  action: ContractAction,
): boolean {
  const permission: Permission =
    type === "RENTAL"
      ? `contracts.rental.${action}`
      : `contracts.sale.${action}`;
  if (!can(user.role, permission)) return false;
  return (
    user.role !== "SALES" ||
    user.contractScope === "ALL" ||
    user.contractScope === type
  );
}

/** The contract types a user may view, for list filters and menus. */
export function viewableContractTypes(user: ContractUser): ContractType[] {
  return (["RENTAL", "SALE"] as const).filter((type) =>
    canContract(user, type, "view"),
  );
}
