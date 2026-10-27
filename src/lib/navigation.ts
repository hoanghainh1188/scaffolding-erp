import { can, type Permission } from "@/domain/permissions";
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
  permission: Permission;
}

/**
 * Desktop menu (design D3). Who sees an item comes from the permission table;
 * hiding it only tidies the UI, the page checks the same permission.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/dashboard",
    label: "Tổng quan",
    icon: "layout-dashboard",
    permission: "dashboard.view",
  },
  {
    href: "/purchasing",
    label: "Thu mua",
    icon: "shopping-cart",
    permission: "purchasing.view",
  },
  {
    href: "/inventory",
    label: "Kho",
    icon: "warehouse",
    permission: "inventory.view",
  },
  {
    href: "/repairs",
    label: "Sửa chữa",
    icon: "wrench",
    permission: "repairs.view",
  },
  {
    href: "/sales",
    label: "Bán & Thuê",
    icon: "file-signature",
    permission: "sales.view",
  },
  {
    href: "/receivables",
    label: "Công nợ",
    icon: "wallet",
    permission: "receivables.view",
  },
  {
    href: "/reports",
    label: "Báo cáo",
    icon: "chart-column",
    permission: "reports.view",
  },
  {
    href: "/catalog",
    label: "Danh mục",
    icon: "list",
    permission: "catalog.view",
  },
  {
    href: "/settings",
    label: "Cài đặt",
    icon: "settings",
    permission: "settings.view",
  },
];

export function navItemsForRole(role: Role): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => can(role, item.permission));
}
