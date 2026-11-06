"use client";

// "Tra nhanh một công trình" of D1 (spec dashboard, design D5, D7, D9):
// type 2+ characters (250 ms pause), pick a site with the keyboard or the
// mouse, see each rental contract there. The server leaves money out for a
// viewer without receivables.view; nothing is hidden here.
import Link from "next/link";
import { useEffect, useId, useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { formatBusinessDate } from "@/domain/business-date";
import { CONTRACT_STATUS_LABELS, type ContractStatus } from "@/domain/contract";
import { callApi } from "@/lib/api-client";
import type { LookupContract, LookupSite } from "@/lib/dashboard/lookup";
import { cn } from "@/lib/utils";

import { money, pieces, tons } from "./format";
import { Panel } from "./panel";

export const LOOKUP_DEBOUNCE_MS = 250;

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div>
      <dt className="text-caption font-semibold text-muted-foreground">
        {label}
      </dt>
      <dd className="font-bold">{value}</dd>
      {note ? (
        <dd className="text-caption font-normal text-muted-foreground">
          {note}
        </dd>
      ) : null}
    </div>
  );
}

function ContractCard({ entry }: { entry: LookupContract }) {
  const { money: owned } = entry;
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-4 rounded-md bg-background p-4">
      <div className="flex min-w-[240px] flex-1 flex-col gap-0.5">
        <Link
          href={`/sales/contracts/${entry.id}`}
          className="text-label text-primary hover:underline"
        >
          {entry.code}
        </Link>
        <span className="text-label font-normal">{entry.customerName}</span>
        <span className="text-caption font-normal text-muted-foreground">
          {entry.signedDate
            ? `ký ${formatBusinessDate(entry.signedDate)} · `
            : ""}
          {CONTRACT_STATUS_LABELS[entry.status as ContractStatus] ??
            entry.status}
        </span>
      </div>
      <dl className="grid flex-[2_1_420px] grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-x-4 gap-y-2 text-label font-normal tabular-nums">
        <Figure
          label="Đang giữ"
          value={pieces(entry.onSite.piecesMilli)}
          note={tons(entry.onSite.kgMilli)}
        />
        {owned ? (
          <>
            <Figure
              label="Thuê tháng này"
              value={money(owned.rentThisMonth)}
              note={`tạm tính đến ${formatBusinessDate(owned.rentAsOf).slice(0, 5)}`}
            />
            <Figure
              label="Đang nợ"
              value={money(owned.owed)}
              note={
                owned.overdue.amount > 0
                  ? `quá hạn ${owned.overdue.days} ngày`
                  : "chưa quá hạn"
              }
            />
            <Figure
              label="Cọc"
              value={money(owned.depositAgreed)}
              note={
                owned.depositAgreed === 0
                  ? "không có cọc tiền"
                  : owned.depositReceived >= owned.depositAgreed
                    ? "cọc tiền, đã nhận"
                    : `đã nhận ${money(owned.depositReceived)}`
              }
            />
          </>
        ) : null}
      </dl>
    </div>
  );
}

export function SiteLookup() {
  const listId = useId();
  const [q, setQ] = useState("");
  const [sites, setSites] = useState<LookupSite[]>([]);
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState("");

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return;
    const timer = setTimeout(async () => {
      const result = await callApi<{ sites: LookupSite[] }>(
        `/api/dashboard/site-lookup?q=${encodeURIComponent(text)}`,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setSearched(text);
      setSites(result.data.sites);
      setActive(0);
      setChosen(
        result.data.sites.length === 1
          ? (result.data.sites[0]?.siteId ?? null)
          : null,
      );
    }, LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  // Results belong to the text they were found for; older ones are hidden.
  const current = searched !== "" && searched === q.trim();
  const shown = current ? sites : [];
  const open = shown.length > 1 && chosen === null;
  const site = shown.find((entry) => entry.siteId === chosen);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, shown.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      setChosen(shown[active]?.siteId ?? null);
    } else if (event.key === "Escape") {
      setQ("");
    }
  }

  return (
    <Panel
      id="lookup"
      title="Tra nhanh một công trình"
      note="Gõ mã hoặc tên công trình, nhà thầu. Kinh doanh thấy số hàng, không thấy tiền."
    >
      <div className="relative">
        <Input
          role="combobox"
          aria-label="Mã hoặc tên công trình, nhà thầu"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="VD: CT-0007, An Phú, Minh Phát"
          className="h-11 text-body"
        />
        {open ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-popover"
          >
            {shown.map((entry, index) => (
              <li
                key={entry.siteId}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setChosen(entry.siteId);
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  "cursor-pointer px-3 py-2 text-label font-normal",
                  index === active && "bg-accent",
                )}
              >
                <span className="font-semibold">{entry.code}</span> ·{" "}
                {entry.name}
                <span className="block text-caption text-muted-foreground">
                  {[
                    ...new Set(
                      entry.contracts.map((contract) => contract.customerName),
                    ),
                  ].join(", ")}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-label text-destructive">
          {error}
        </p>
      ) : null}
      {current && shown.length === 0 && !error ? (
        <p className="text-body text-muted-foreground" aria-live="polite">
          Không tìm thấy công trình nào.
        </p>
      ) : null}
      {site ? (
        <div className="flex flex-col gap-3" aria-live="polite">
          <div className="flex flex-col gap-0.5">
            <span className="text-body font-bold">
              {site.code} · {site.name}
            </span>
            <span className="text-label font-normal text-muted-foreground">
              {site.provinceName
                ? `${site.provinceName} (${site.regionLabel})`
                : "Chưa có tỉnh"}{" "}
              · đang giữ {pieces(site.onSite.piecesMilli)},{" "}
              {tons(site.onSite.kgMilli)}
            </span>
          </div>
          {site.contracts.map((entry) => (
            <ContractCard key={entry.id} entry={entry} />
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
