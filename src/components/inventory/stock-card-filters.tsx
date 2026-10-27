"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONDITION_LABELS, CONDITIONS } from "@/domain/condition";
import { cn } from "@/lib/utils";

interface StockCardFiltersProps {
  condition: string;
  place: string;
  site: string | null;
  from: string;
  to: string;
  sites: { code: string; name: string }[];
}

const TABS = [
  { value: "all", label: "Tất cả" },
  ...CONDITIONS.map((value) => ({ value, label: CONDITION_LABELS[value] })),
];

/** D11 filters, all in the URL: condition tabs, place, period. */
export function StockCardFilters(props: StockCardFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [place, setPlace] = useState(
    props.site ? `site:${props.site}` : props.place,
  );
  const [from, setFrom] = useState(props.from);
  const [to, setTo] = useState(props.to);

  const href = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return `${pathname}?${next.toString()}`;
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    const site = place.startsWith("site:") ? place.slice(5) : null;
    router.replace(
      href({
        place: site ? "sites" : place,
        site,
        from: from || null,
        to: to || null,
      }),
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <nav
        aria-label="Tình trạng"
        className="inline-flex flex-wrap gap-1 rounded-md bg-muted p-1"
      >
        {TABS.map((tab) => {
          const active = props.condition === tab.value;
          return (
            <Link
              key={tab.value}
              href={href({ condition: tab.value })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-sm px-3.5 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="card-place">Vị trí</Label>
          <select
            id="card-place"
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            className="h-11 rounded-md border border-input bg-card px-3 text-base"
          >
            <option value="yard">Tại bãi</option>
            <option value="workshop">Tại xưởng</option>
            <option value="sites">Tại công trình (tất cả)</option>
            {props.sites.map((site) => (
              <option key={site.code} value={`site:${site.code}`}>
                {site.code} · {site.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="card-from">Từ ngày</Label>
          <Input
            id="card-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="card-to">Đến ngày</Label>
          <Input
            id="card-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="w-40"
          />
        </div>
        <Button type="submit" variant="outline">
          Xem
        </Button>
      </form>
    </div>
  );
}
