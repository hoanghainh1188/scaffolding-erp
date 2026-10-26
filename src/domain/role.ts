import { DomainValueError } from "./errors";

export const ROLES = [
  "DIRECTOR",
  "ACCOUNTANT",
  "SALES",
  "WAREHOUSE",
  "WORKSHOP",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  DIRECTOR: "Giám đốc",
  ACCOUNTANT: "Kế toán",
  SALES: "Kinh doanh",
  WAREHOUSE: "Thủ kho",
  WORKSHOP: "Xưởng",
};

export type Surface = "DESKTOP" | "MOBILE";

const MOBILE_ROLES: ReadonlySet<Role> = new Set(["WAREHOUSE", "WORKSHOP"]);

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function parseRole(value: string): Role {
  if (!isRole(value)) {
    throw new DomainValueError(
      `Vai trò không hợp lệ: "${value}". Chỉ nhận ${ROLES.join(", ")}`,
    );
  }
  return value;
}

/** Warehouse and workshop staff work on phones; the office uses desktop. */
export function defaultSurfaceForRole(role: Role): Surface {
  return MOBILE_ROLES.has(role) ? "MOBILE" : "DESKTOP";
}
