"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StockFiltersProps {
  groups: { id: string; name: string }[];
}

/** D10 search, group and "Hiện giá trị", all in the URL. */
export function StockFilters({ groups }: StockFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const showValue = params.get("value") !== "hide";

  function go(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
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
      <div className="relative min-w-0 flex-1 basis-60">
        <Label htmlFor="stock-q" className="sr-only">
          Tìm mã hàng
        </Label>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="stock-q"
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Tìm theo mã hoặc tên"
          className="pl-10"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="stock-group">Nhóm</Label>
        <select
          id="stock-group"
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
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={showValue}
          onChange={(event) =>
            go({ value: event.target.checked ? null : "hide" })
          }
          className="size-4 accent-primary"
        />
        Hiện giá trị
      </label>
      <Button type="submit" variant="outline">
        Tìm
      </Button>
    </form>
  );
}
