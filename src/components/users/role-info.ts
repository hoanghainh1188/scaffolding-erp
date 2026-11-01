import { ROLES, type Role } from "@/domain/role";
import { dict } from "@/locales";

/** One line per role for the D17 role picker. */
export const ROLE_DESCRIPTIONS: Readonly<Record<Role, string>> =
  dict.users.roles.descriptions;

/** Shown first when adding someone (design D17); the rest on request. */
export const COMMON_NEW_ROLES: readonly Role[] = [
  "SALES",
  "WAREHOUSE",
  "WORKSHOP",
];

export const ALL_ROLES: readonly Role[] = ROLES;

export interface CountsLike {
  active: number;
  locked: number;
}

/** "7 tài khoản đang hoạt động · 1 tài khoản bị khóa" */
export function describeCounts({ active, locked }: CountsLike): string {
  const parts = [`${active} người đang dùng`];
  if (locked > 0) parts.push(`${locked} tài khoản đã khóa`);
  return parts.join(" · ");
}
