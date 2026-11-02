import Link from "next/link";

import {
  CONTRACT_GROUP_LABELS,
  CONTRACT_GROUPS,
  type ContractGroup,
} from "@/domain/contract";
import { cn } from "@/lib/utils";

interface ContractGroupsProps {
  active: ContractGroup;
  counts: Readonly<Record<ContractGroup, number>>;
  hrefOf: (group: ContractGroup) => string;
}

/** D4 tiles "Tất cả · 42", "Chờ duyệt · 2"...; the group lives in the URL. */
export function ContractGroups({
  active,
  counts,
  hrefOf,
}: ContractGroupsProps) {
  return (
    <nav
      aria-label="Nhóm hợp đồng"
      className="flex flex-wrap gap-1 rounded-md bg-muted p-1"
    >
      {CONTRACT_GROUPS.map((group) => (
        <Link
          key={group}
          href={hrefOf(group)}
          aria-current={active === group ? "page" : undefined}
          className={cn(
            "inline-flex h-9 items-center rounded-sm px-3 text-sm font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            active === group
              ? "bg-card font-semibold text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {CONTRACT_GROUP_LABELS[group]} · {counts[group]}
        </Link>
      ))}
    </nav>
  );
}

/** "/sales/contracts?group=pending&q=..." keeping the other filters. */
export function contractListHref(
  params: Readonly<Record<string, string | string[] | undefined>>,
  changes: Readonly<Record<string, string | null>>,
): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") next.set(key, value);
  }
  next.delete("page");
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  const query = next.toString();
  return query ? `/sales/contracts?${query}` : "/sales/contracts";
}
