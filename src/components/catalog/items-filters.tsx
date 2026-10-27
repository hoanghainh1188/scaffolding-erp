"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ItemsFiltersProps {
  groups: { id: string; name: string }[];
  /** Search placeholder, e.g. "Tìm vật tư". */
  placeholder: string;
  /** Show the group select (items only). */
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
        <div className="flex flex-col gap-1">
          <Label htmlFor="catalog-group">Nhóm</Label>
          <select
            id="catalog-group"
            value={params.get("group") ?? ""}
            onChange={(event) => go({ group: event.target.value || null })}
            className="h-11 rounded-md border border-input bg-card px-3 text-base"
          >
            <option value="">Tất cả</option>
            {groups.map((group) => (
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
