"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Label } from "@/components/ui/label";

export interface UrlSelectOption {
  value: string;
  label: string;
}

interface UrlSelectProps {
  id: string;
  label: string;
  /** The URL parameter this select sets, e.g. "region". */
  param: string;
  /** The first option, meaning "no filter". */
  allLabel: string;
  options: readonly UrlSelectOption[];
  /** Parameters cleared when this one changes (a province under a region). */
  clears?: readonly string[];
}

/** A filter kept in the URL (D16 region, province and sales staff). */
export function UrlSelect({
  id,
  label,
  param,
  allLabel,
  options,
  clears = [],
}: UrlSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function change(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(param, value);
    else next.delete(param);
    for (const name of [...clears, "id"]) next.delete(name);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={params.get(param) ?? ""}
        onChange={(event) => change(event.target.value)}
        className="h-11 rounded-md border border-input bg-card px-3 text-base"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
