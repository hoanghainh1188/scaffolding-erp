import { ROLES, type Role } from "@/domain/role";

/** One line per role for the D17 role picker. */
export const ROLE_DESCRIPTIONS: Readonly<Record<Role, string>> = {
  DIRECTOR: "Duyệt hợp đồng, đền bù, quản lý người dùng. Dùng máy tính.",
  ACCOUNTANT: "Tiền thuê, công nợ, xuất Excel. Dùng máy tính.",
  SALES: "Thu mua, báo giá, hợp đồng. Dùng máy tính.",
  WAREHOUSE: "Nhập, xuất, thu hồi tại bãi. Dùng điện thoại.",
  WORKSHOP: "Ghi nhận sửa chữa. Dùng điện thoại.",
};

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

/** "7 người đang dùng · 1 tài khoản đã khóa" */
export function describeCounts({ active, locked }: CountsLike): string {
  const parts = [`${active} người đang dùng`];
  if (locked > 0) parts.push(`${locked} tài khoản đã khóa`);
  return parts.join(" · ");
}
