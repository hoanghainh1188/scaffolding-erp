"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PURCHASE_KIND_LABELS, PURCHASE_KINDS } from "@/domain/purchase-order";

/** D2 search and kind filter, in the URL (page goes back to 1). */
export function OrderFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function go(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    next.delete("page");
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
      className="flex flex-wrap items-center gap-3"
    >
      <div className="relative min-w-0 flex-1 basis-56">
        <Label htmlFor="order-q" className="sr-only">
          Tìm đơn
        </Label>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="order-q"
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Số đơn hoặc nhà cung cấp"
          className="pl-10"
        />
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="order-kind-filter">Loại</Label>
        <select
          id="order-kind-filter"
          value={params.get("kind") ?? ""}
          onChange={(event) => go({ kind: event.target.value || null })}
          className="h-11 rounded-md border border-input bg-card px-3 text-base"
        >
          <option value="">Tất cả</option>
          {[...PURCHASE_KINDS].reverse().map((kind) => (
            <option key={kind} value={kind}>
              {PURCHASE_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>
    </form>
  );
}
