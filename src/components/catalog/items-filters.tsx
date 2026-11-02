"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dict } from "@/locales";

const CATEGORIES = ["EQUIPMENT", "MATERIAL"] as const;

interface ItemsFiltersProps {
  groups: { id: string; name: string; category?: string }[];
  /** Search placeholder, e.g. "Tìm vật tư". */
  placeholder: string;
  /** Show the category buttons and the group select (items only). */
  withGroups?: boolean;
}

/** Search, group and status filters kept in the URL (spec item-catalog). */
export function ItemsFilters({
  groups,
  placeholder,
  withGroups = true,
}: ItemsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function go(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("item");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  const category = params.get("category");
  // The group select only offers groups of the chosen category (design D8).
  const shownGroups = category
    ? groups.filter((group) => group.category === category)
    : groups;

  function submit(event: FormEvent) {
    event.preventDefault();
    go({ q: q.trim() || null });
  }

  return (
    <form
      onSubmit={submit}
      role="search"
      className="flex flex-wrap items-end gap-3"
    >
      <div className="relative min-w-0 flex-1 basis-56">
        <Label htmlFor="catalog-q" className="sr-only">
          {placeholder}
        </Label>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="catalog-q"
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={placeholder}
          className="pl-10"
        />
      </div>
      {withGroups ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-label">
            {dict.catalog.categories.label}
          </legend>
          <div
            role="group"
            className="inline-flex h-11 overflow-hidden rounded-md border border-input bg-card"
          >
            {[null, ...CATEGORIES].map((value) => (
              <button
                key={value ?? "all"}
                type="button"
                aria-pressed={category === value}
                onClick={() => go({ category: value, group: null })}
                className="px-3 text-base transition-colors not-first:border-l not-first:border-input hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              >
                {value === null
                  ? dict.catalog.categories.all
                  : dict.catalog.categories[value]}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      {withGroups ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="catalog-group">Nhóm</Label>
          <select
            id="catalog-group"
            value={params.get("group") ?? ""}
            onChange={(event) => go({ group: event.target.value || null })}
            className="h-11 rounded-md border border-input bg-card px-3 text-base"
          >
            <option value="">Tất cả</option>
            {shownGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <Label htmlFor="catalog-status">Trạng thái</Label>
        <select
          id="catalog-status"
          value={params.get("status") === "archived" ? "archived" : ""}
          onChange={(event) => go({ status: event.target.value || null })}
          className="h-11 rounded-md border border-input bg-card px-3 text-base"
        >
          <option value="">Đang dùng</option>
          <option value="archived">Ngừng dùng</option>
        </select>
      </div>
      <Button type="submit" variant="outline">
        Tìm
      </Button>
    </form>
  );
}
