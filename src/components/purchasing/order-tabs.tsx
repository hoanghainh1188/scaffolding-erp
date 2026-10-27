import Link from "next/link";

import {
  ORDER_TAB_LABELS,
  ORDER_TABS,
  type OrderTab,
} from "@/lib/purchasing/queries";
import { cn } from "@/lib/utils";

interface OrderTabsProps {
  active: OrderTab;
  counts: Readonly<Record<OrderTab, number>>;
  hrefOf: (tab: OrderTab) => string;
}

/** D2 status tabs with their counts; the tab lives in the URL. */
export function OrderTabs({ active, counts, hrefOf }: OrderTabsProps) {
  return (
    <nav
      aria-label="Trạng thái đơn"
      className="flex flex-wrap gap-1 rounded-md bg-muted p-1"
    >
      {ORDER_TABS.map((tab) => (
        <Link
          key={tab}
          href={hrefOf(tab)}
          aria-current={active === tab ? "page" : undefined}
          className={cn(
            "inline-flex h-9 items-center rounded-sm px-3 text-sm font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            active === tab
              ? "bg-card font-semibold text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {ORDER_TAB_LABELS[tab]} · {counts[tab]}
        </Link>
      ))}
    </nav>
  );
}

/** "/purchasing?tab=waiting&q=..." keeping the other filters, page reset. */
export function orderListHref(
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
  return query ? `/purchasing?${query}` : "/purchasing";
}
