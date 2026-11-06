// "Phải thu / Phải trả" at the top of Công nợ (payables spec "Thanh tab").
// Each tab shows only for who may read it; the open one is marked.
import Link from "next/link";

import { can } from "@/domain/permissions";
import type { Role } from "@/domain/role";
import { cn } from "@/lib/utils";

const TABS = [
  {
    key: "receivables",
    href: "/receivables",
    label: "Phải thu",
    permission: "receivables.view",
  },
  {
    key: "payables",
    href: "/payables",
    label: "Phải trả",
    permission: "payables.view",
  },
] as const;

export type LedgerTab = (typeof TABS)[number]["key"];

export function LedgerTabs({
  role,
  active,
}: {
  role: Role;
  active: LedgerTab;
}) {
  const tabs = TABS.filter((tab) => can(role, tab.permission));
  if (tabs.length < 2) return null;
  return (
    <nav
      aria-label="Công nợ"
      className="flex w-fit gap-1 rounded-md bg-muted p-1"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={cn(
            "rounded-sm px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
            tab.key === active &&
              "bg-card font-medium text-foreground shadow-xs",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
