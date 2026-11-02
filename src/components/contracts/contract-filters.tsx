"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTRACT_TYPE_LABELS, type ContractType } from "@/domain/contract";

interface ContractFiltersProps {
  /** Types the user may see; the type filter shows only with both. */
  types: readonly ContractType[];
  sellers: readonly { id: string; name: string }[];
}

/** D4 search and filters, in the URL (page goes back to 1). */
export function ContractFilters({ types, sellers }: ContractFiltersProps) {
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
        <Label htmlFor="contract-q" className="sr-only">
          Tìm hợp đồng
        </Label>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="contract-q"
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Số hợp đồng"
          className="pl-10"
        />
      </div>
      {types.length > 1 ? (
        <div className="flex items-center gap-2">
          <Label htmlFor="contract-type-filter">Loại</Label>
          <select
            id="contract-type-filter"
            value={params.get("type") ?? ""}
            onChange={(event) => go({ type: event.target.value || null })}
            className="h-11 rounded-md border border-input bg-card px-3 text-base"
          >
            <option value="">Tất cả</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {CONTRACT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {sellers.length > 0 ? (
        <div className="flex items-center gap-2">
          <Label htmlFor="contract-seller-filter">Phụ trách</Label>
          <select
            id="contract-seller-filter"
            value={params.get("salesUserId") ?? ""}
            onChange={(event) =>
              go({ salesUserId: event.target.value || null })
            }
            className="h-11 rounded-md border border-input bg-card px-3 text-base"
          >
            <option value="">Tất cả</option>
            {sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </form>
  );
}
