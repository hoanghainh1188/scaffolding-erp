"use client";

import {
  ClipboardList,
  History,
  ScanLine,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
}

const TABS: readonly Tab[] = [
  { href: "/m", label: "Việc hôm nay", icon: ClipboardList },
  { href: "/m/scan", label: "Quét mã", icon: ScanLine },
  { href: "/m/history", label: "Lịch sử", icon: History },
  { href: "/m/profile", label: "Cá nhân", icon: UserRound },
];

function isCurrent(pathname: string, href: string): boolean {
  // "/m" is the home tab: only exact, or every page would match it.
  return href === "/m"
    ? pathname === "/m"
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-card pb-[env(safe-area-inset-bottom)] print:hidden"
    >
      <ul className="mx-auto grid w-full max-w-[640px] grid-cols-4 px-[env(safe-area-inset-left)]">
        {TABS.map(({ href, label, icon: Icon }) => {
          const current = isCurrent(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className="group flex min-h-12 flex-col items-center justify-center gap-0.5 py-1.5 text-caption text-muted-foreground aria-[current=page]:text-foreground"
              >
                <span
                  className={cn(
                    "grid h-8 w-14 place-items-center rounded-pill transition-colors duration-150",
                    current
                      ? "bg-accent text-accent-foreground"
                      : "group-hover:bg-muted",
                  )}
                >
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className={cn("truncate", current && "font-semibold")}>
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
