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
  "reports.view": ["DIRECTOR", "ACCOUNTANT"],
  "catalog.view": OFFICE,
  "settings.view": ["DIRECTOR"],
  "users.manage": ["DIRECTOR"],
  // Roles that must have a second factor (0.2 số 133) and manage their own.
  "twoFactor.manage": ["DIRECTOR", "ACCOUNTANT"],
  // master-data design D9: everyone reads the catalog (the phone screens of
  // later changes need it); writes are split by who owns the data.
  "catalog.read": EVERYONE,
  "items.manage": ["DIRECTOR", "SALES"],
  "partners.manage": ["DIRECTOR", "SALES", "ACCOUNTANT"],
  // Cannot be undone, so one person answers for it (personal-data-protection D7).
  "partners.anonymize": ["DIRECTOR"],
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
  // repair-work-orders design D6: the workshop takes, works and reports an
  // order on the phone; the storekeeper counts it. Neither sees any price.
  "repairs.work": ["DIRECTOR", "WORKSHOP"],
  "repairs.count": ["DIRECTOR", "WAREHOUSE"],
  // production-orders design D6: its own permissions, even though the roles
  // match repairs today (the owner may split repairing from making goods).
  "production.view": OFFICE,
  "production.manage": ["DIRECTOR", "ACCOUNTANT"],
  "production.approve": ["DIRECTOR"],
  "production.work": ["DIRECTOR", "WORKSHOP"],
  "production.count": ["DIRECTOR", "WAREHOUSE"],
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
  // rental-billing design D10: the office reads rent by period (sales also
  // through canContract("RENTAL", "view")); the accountant and the director
  // close periods and write adjustments; only the director edits holidays.
  "billing.view": OFFICE,
  "billing.manage": ["DIRECTOR", "ACCOUNTANT"],
  "holidays.manage": ["DIRECTOR"],
  // receivables design D6 (0.2 #85, #86): only the accountant and the
  // director see receivables (receivables.view above), write and cancel
  // receipts, and settle a contract, without a separate approval.
  "receipts.manage": ["DIRECTOR", "ACCOUNTANT"],
  "contracts.close": ["DIRECTOR", "ACCOUNTANT"],
  // payables design D6 (0.2 số 103): only the accountant and the director see
  // what is owed to sellers and record or cancel supplier payments. The
  // warehouse never writes a payment; cash paid at the gate is told to the
  // accountant, who records it with the real date.
  "payables.view": ["DIRECTOR", "ACCOUNTANT"],
  "payments.manage": ["DIRECTOR", "ACCOUNTANT"],
} as const satisfies Readonly<Record<string, readonly Role[]>>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Role plus the account's "Admin hệ thống" flag (0.2 số 138). */
export interface AccountUser {
  role: Role;
  systemAdmin: boolean;
}

/** Sets up and manages one's own second factor. */
export function canManageTwoFactor(user: AccountUser): boolean {
  return user.systemAdmin || can(user.role, "twoFactor.manage");
}

/** Clears someone else's second factor: the flag decides, not the role. */
export function canResetOthersTwoFactor(user: AccountUser): boolean {
  return user.systemAdmin;
}

/** Opens D17. An admin who is not a director only gets the reset action. */
export function canOpenUsers(user: AccountUser): boolean {
  return user.systemAdmin || can(user.role, "users.manage");
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
