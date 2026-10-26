import type { Role } from "@/domain/role";

/** Icon names from lucide-react; the sidebar maps them to components. */
export type NavIcon =
  | "layout-dashboard"
  | "shopping-cart"
  | "warehouse"
  | "wrench"
  | "file-signature"
  | "wallet"
  | "chart-column"
  | "list"
  | "settings";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  roles: readonly Role[];
}

const OFFICE: readonly Role[] = ["DIRECTOR", "ACCOUNTANT", "SALES"];

/**
 * Desktop menu (design D3). Hiding an item only tidies the UI; permissions
 * are enforced on the server from auth-and-roles onwards.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/dashboard",
    label: "Tổng quan",
    icon: "layout-dashboard",
    roles: OFFICE,
  },
  {
    href: "/purchasing",
    label: "Thu mua",
    icon: "shopping-cart",
    roles: OFFICE,
  },
  { href: "/inventory", label: "Kho", icon: "warehouse", roles: OFFICE },
  { href: "/repairs", label: "Sửa chữa", icon: "wrench", roles: OFFICE },
  {
    href: "/sales",
    label: "Bán & Thuê",
    icon: "file-signature",
    roles: OFFICE,
  },
  {
    href: "/receivables",
    label: "Công nợ",
    icon: "wallet",
    roles: ["DIRECTOR", "ACCOUNTANT"],
  },
  {
    href: "/reports",
    label: "Báo cáo",
    icon: "chart-column",
    roles: ["DIRECTOR"],
  },
  { href: "/catalog", label: "Danh mục", icon: "list", roles: OFFICE },
  {
    href: "/settings",
    label: "Cài đặt",
    icon: "settings",
    roles: ["DIRECTOR"],
  },
];

export function navItemsForRole(role: Role): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
