"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { DateInput } from "@/components/domain/date-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type ActionGroup,
} from "@/domain/activity";
import { ROLE_LABELS, type Role } from "@/domain/role";
import { cn } from "@/lib/utils";

import { GROUP_CHIPS } from "./format";

export interface ActivityFilterValues {
  from: string;
  to: string;
  userId: string | null;
  type: string | null;
  code: string | null;
  group: ActionGroup | null;
  review: boolean;
}

interface ActivityFiltersProps {
  values: ActivityFilterValues;
  people: { id: string; name: string; username: string; role: Role }[];
  reviewCount: number;
}

const SELECT =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** D18 "Lọc nhật ký": every filter lives in the URL. */
export function ActivityFilters({
  values,
  people,
  reviewCount,
}: ActivityFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [userId, setUserId] = useState(values.userId ?? "");
  const [type, setType] = useState(values.type ?? "");
  const [from, setFrom] = useState(values.from);
  const [to, setTo] = useState(values.to);
  const [code, setCode] = useState(values.code ?? "");

  const href = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    router.replace(
      href({
        user: userId || null,
        type: type || null,
        from: from || null,
        to: to || null,
        code: code.trim() || null,
      }),
    );
  }

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-9 items-center rounded-pill border px-3.5 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      active
        ? "border-transparent bg-foreground text-background"
        : "border-border bg-card text-foreground hover:bg-accent",
    );

  return (
    <section
      aria-labelledby="activity-filters"
      className="flex flex-col gap-4 rounded-lg border bg-card p-5"
    >
      <h2 id="activity-filters" className="text-label">
        Lọc nhật ký
      </h2>
      <form
        onSubmit={submit}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_auto_auto_1fr_auto] lg:items-end"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="f-user">Người làm</Label>
          <select
            id="f-user"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            className={SELECT}
          >
            <option value="">Tất cả ({people.length})</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} ({person.username}) · {ROLE_LABELS[person.role]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="f-type">Loại chứng từ</Label>
          <select
            id="f-type"
            value={type}
            onChange={(event) => setType(event.target.value)}
            className={SELECT}
          >
            <option value="">Tất cả</option>
            {DOCUMENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {DOCUMENT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-from">Từ ngày</Label>
          <DateInput
            id="f-from"
            value={from}
            onValueChange={setFrom}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-to">Đến ngày</Label>
          <DateInput
            id="f-to"
            value={to}
            onValueChange={setTo}
            className="w-40"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="f-code">Mã chứng từ</Label>
          <Input
            id="f-code"
            type="search"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="VD PO-2026-055"
            className="h-11"
          />
        </div>
        <Button type="submit" variant="outline" className="h-11">
          Lọc
        </Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Loại thao tác"
          className="flex flex-wrap gap-2"
        >
          {GROUP_CHIPS.map((entry) => {
            const active = values.group === entry.value;
            return (
              <Link
                key={entry.label}
                href={href({ group: entry.value })}
                aria-current={active ? "true" : undefined}
                className={chip(active)}
              >
                {entry.label}
              </Link>
            );
          })}
        </div>
        <Link
          href={href({ review: values.review ? null : "1" })}
          role="switch"
          aria-checked={values.review}
          className={cn(
            chip(values.review),
            !values.review && "border-warning text-warning",
          )}
        >
          Chỉ cần xem kỹ ({reviewCount})
        </Link>
      </div>
    </section>
  );
}

/** "Xuất Excel": downloads the filter, or says why it cannot. */
export function ExportButton({ query }: { query: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function download() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/activity/export${query}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Không xuất được. Thử lại sau.");
        return;
      }
      const name =
        /filename="([^"]+)"/.exec(
          response.headers.get("content-disposition") ?? "",
        )?.[1] ?? "nhat-ky.xlsx";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Không xuất được. Kiểm tra kết nối mạng rồi thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        onClick={download}
        disabled={pending}
      >
        <Download aria-hidden className="size-4" />
        {pending ? "Đang xuất…" : "Xuất Excel"}
      </Button>
      {error ? (
        <p
          role="alert"
          className="max-w-sm text-right text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
