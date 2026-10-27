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
} as const satisfies Readonly<Record<string, readonly Role[]>>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
