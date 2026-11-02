"use client";

import {
  ChartColumn,
  FileSignature,
  LayoutDashboard,
  List,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShoppingCart,
  Wallet,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { NavIcon, NavItem } from "@/lib/navigation";
import { dict } from "@/locales";

const ICONS: Readonly<Record<NavIcon, LucideIcon>> = {
  "layout-dashboard": LayoutDashboard,
  "shopping-cart": ShoppingCart,
  warehouse: Warehouse,
  wrench: Wrench,
  "file-signature": FileSignature,
  wallet: Wallet,
  "chart-column": ChartColumn,
  list: List,
  settings: Settings,
};

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface AppSidebarProps {
  /** Already filtered for the current role (navItemsForRole). */
  items: readonly NavItem[];
}

export function AppSidebar({ items }: AppSidebarProps) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile, open, toggleSidebar } = useSidebar();

  return (
    <Sidebar collapsible="icon" aria-label="Điều hướng chính">
      <SidebarHeader className="h-16 justify-center">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-sm px-2 sidebar-collapsed:px-0"
          onClick={() => setOpenMobile(false)}
        >
          <span
            aria-hidden
            className="grid size-8 shrink-0 place-items-center rounded-sm bg-primary font-display text-label text-primary-foreground"
          >
            SE
          </span>
          <span className="truncate font-display text-h2 sidebar-collapsed:hidden">
            {dict.navigation.desktop.brandName}
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = isActive(pathname, item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className="h-10 text-body data-active:font-semibold"
                    >
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setOpenMobile(false)}
                      >
                        <Icon aria-hidden />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {!isMobile && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={toggleSidebar}
                tooltip={
                  open
                    ? dict.navigation.desktop.sidebarCollapse
                    : dict.navigation.desktop.sidebarExpand
                }
                className="h-10 text-muted-foreground"
              >
                {/* Icon follows the effective state; before hydration CSS decides. */}
                <PanelLeftClose
                  aria-hidden
                  className="sidebar-collapsed:hidden"
                />
                <PanelLeftOpen
                  aria-hidden
                  className="hidden sidebar-collapsed:block"
                />
                <span>
                  {open
                    ? dict.navigation.desktop.sidebarCollapse
                    : dict.navigation.desktop.sidebarExpand}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
