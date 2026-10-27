"use client";

import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { QuantityUnit } from "@/domain/quantity";
import type { SiteStock } from "@/lib/inventory/stock";

import { formatStock } from "./format";
import { stockCardHref } from "./links";

interface SitesMenuProps {
  code: string;
  unit: QuantityUnit;
  total: number;
  sites: SiteStock[];
}

/** D10 "Tại công trình": the total opens the list of sites. */
export function SitesMenu({ code, unit, total, sites }: SitesMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${code} tại công trình: ${formatStock(total, unit)}, xem từng công trình`}
        className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {formatStock(total, unit)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuLabel>{code} tại công trình</DropdownMenuLabel>
        {sites.map((site) => (
          <DropdownMenuItem key={site.locationId} asChild>
            <Link
              href={stockCardHref(code, {
                condition: "all",
                place: "sites",
                site: site.siteCode,
              })}
              className="flex justify-between gap-4"
            >
              <span className="flex flex-col">
                <span>{site.siteName}</span>
                <span className="text-caption text-muted-foreground">
                  {site.siteCode}
                </span>
              </span>
              <span className="tabular-nums">
                {formatStock(site.quantity, unit)}
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
