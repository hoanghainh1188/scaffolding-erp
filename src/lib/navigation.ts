import { can, type Permission } from "@/domain/permissions";
import type { Role } from "@/domain/role";
import { dict } from "@/locales";

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
    label: dict.navigation.desktop.dashboard,
    icon: "layout-dashboard",
    permission: "dashboard.view",
  },
  {
    href: "/purchasing",
    label: dict.navigation.desktop.purchasing,
    icon: "shopping-cart",
    permission: "purchasing.view",
  },
  {
    href: "/inventory",
    label: dict.navigation.desktop.inventory,
    icon: "warehouse",
    permission: "inventory.view",
  },
  {
    href: "/repairs",
    label: dict.navigation.desktop.repairs,
    icon: "wrench",
    permission: "repairs.view",
  },
  {
    href: "/sales",
    label: dict.navigation.desktop.sales,
    icon: "file-signature",
    permission: "sales.view",
  },
  {
    href: "/receivables",
    label: dict.navigation.desktop.receivables,
    icon: "wallet",
    permission: "receivables.view",
  },
  {
    href: "/reports",
    label: dict.navigation.desktop.reports,
    icon: "chart-column",
    permission: "reports.view",
  },
  {
    href: "/catalog",
    label: dict.navigation.desktop.catalog,
    icon: "list",
    permission: "catalog.view",
  },
  {
    href: "/settings",
    label: dict.navigation.desktop.settings,
    icon: "settings",
    permission: "settings.view",
  },
];

export function navItemsForRole(role: Role): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => can(role, item.permission));
}
