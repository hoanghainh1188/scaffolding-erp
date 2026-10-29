"use client";

import { ChevronDown, ChevronUp, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";

import { ToneBadge } from "@/components/domain/tone-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FLAG_LABELS } from "@/domain/activity";
import {
  formatDateTimeSeconds,
  toBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";
import { callApi } from "@/lib/api-client";
import type { ActivityPage, ActivityRow } from "@/lib/activity/queries";
import { initials } from "@/lib/initials";

import {
  actionBadge,
  dayHeading,
  deviceLabel,
  documentHref,
  documentTypeLabel,
  whoText,
} from "./format";

interface ActivityTableProps {
  rows: ActivityRow[];
  days: { date: BusinessDate; count: number }[];
  total: number;
  nextCursor: string | null;
  /** The filter as "?…", for the next pages. */
  query: string;
}

const clock = (iso: string) =>
  formatDateTimeSeconds(new Date(iso)).slice(11, 16);

function Flags({ flags }: { flags: ActivityRow["flags"] }) {
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-2.5">
      {flags.map((flag) => (
        <span
          key={flag}
          className="inline-flex items-center gap-1 text-caption font-semibold whitespace-nowrap text-warning"
        >
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          {FLAG_LABELS[flag]}
        </span>
      ))}
    </span>
  );
}

function Detail({ row }: { row: ActivityRow }) {
  const facts: [string, string][] = [
    ["Thời điểm", formatDateTimeSeconds(new Date(row.at))],
    ["Người làm", `${row.userName} (${row.username})`],
    ["Thiết bị", deviceLabel(row.device, row.browser)],
  ];
  return (
    <div className="flex flex-wrap gap-4 rounded-md border bg-card p-4">
      <div className="flex min-w-0 flex-[2_1_420px] flex-col gap-2">
        <h3 className="text-label">
          {row.documentCode
            ? `Thay đổi trên ${row.documentCode}`
            : "Chi tiết thao tác"}
        </h3>
        {row.changes.length > 0 ? (
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th scope="col" className="py-1.5 pr-3 font-semibold">
                  Trường
                </th>
                <th scope="col" className="py-1.5 pr-3 font-semibold">
                  Trước
                </th>
                <th scope="col" className="py-1.5 font-semibold">
                  Sau
                </th>
              </tr>
            </thead>
            <tbody>
              {row.changes.map((change) => (
                <tr key={change.field} className="border-t">
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                    {change.label}
                  </th>
                  <td className="py-1.5 pr-3 text-muted-foreground">
                    {change.field === "_more" ? "" : (change.before ?? "–")}
                  </td>
                  <td className="py-1.5 font-semibold">
                    {change.field === "_more" ? "" : (change.after ?? "–")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">{row.summary}</p>
        )}
      </div>
      <dl className="flex min-w-0 flex-[1_1_220px] flex-col gap-2 text-sm">
        {facts.map(([term, value]) => (
          <div key={term} className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Row({ row }: { row: ActivityRow }) {
  const [open, setOpen] = useState(false);
  const badge = actionBadge(row.action, row.documentType);
  const href = documentHref(row.documentType, row.documentCode);
  const detailId = `activity-${row.id}`;
  const toggle = () => setOpen((value) => !value);
  return (
    <>
      <tr
        onClick={toggle}
        className={
          open
            ? "cursor-pointer bg-accent/40"
            : "cursor-pointer hover:bg-accent/30"
        }
      >
        <th
          scope="row"
          className="px-3.5 py-2.5 text-left align-top font-semibold tabular-nums"
        >
          {clock(row.at)}
        </th>
        <td className="px-3.5 py-2.5 align-top">
          <span className="flex items-center gap-2.5">
            <Avatar className="size-8">
              <AvatarFallback className="bg-accent text-caption text-accent-foreground">
                {initials(row.userName)}
              </AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-col">
              <span className="font-medium">{row.userName}</span>
              <span className="text-caption whitespace-nowrap text-muted-foreground">
                {whoText(row.role, row.device)}
              </span>
            </span>
          </span>
        </td>
        <td className="px-3.5 py-2.5 align-top">
          <ToneBadge tone={badge.tone}>{badge.label}</ToneBadge>
        </td>
        <td className="px-3.5 py-2.5 align-top">
          {row.documentCode ? (
            <span className="flex flex-col">
              {href ? (
                <Link
                  href={href}
                  onClick={(event) => event.stopPropagation()}
                  className="font-semibold whitespace-nowrap text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {row.documentCode}
                </Link>
              ) : (
                <span className="font-semibold whitespace-nowrap">
                  {row.documentCode}
                </span>
              )}
              <span className="text-caption text-muted-foreground">
                {documentTypeLabel(row.documentType)}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">–</span>
          )}
        </td>
        <td className="min-w-64 px-3.5 py-2.5 align-top">
          <span className="flex flex-col gap-1">
            <span>{row.summary}</span>
            <Flags flags={row.flags} />
          </span>
        </td>
        <td className="w-9 px-3.5 py-2.5 align-top">
          <Button
            type="button"
            variant={open ? "secondary" : "ghost"}
            size="icon"
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={open ? "Ẩn chi tiết" : "Xem chi tiết"}
            onClick={(event) => {
              event.stopPropagation();
              toggle();
            }}
          >
            {open ? (
              <ChevronUp aria-hidden className="size-4" />
            ) : (
              <ChevronDown aria-hidden className="size-4" />
            )}
          </Button>
        </td>
      </tr>
      {open ? (
        <tr id={detailId}>
          <td colSpan={6} className="bg-accent/40 px-3.5 pb-3.5">
            <Detail row={row} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** D18 table: newest first, one header per Vietnam day, "Xem thêm". */
export function ActivityTable(props: ActivityTableProps) {
  const [rows, setRows] = useState(props.rows);
  const [cursor, setCursor] = useState(props.nextCursor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function more() {
    if (!cursor) return;
    setPending(true);
    setError(null);
    const separator = props.query ? "&" : "?";
    const result = await callApi<ActivityPage>(
      `/api/activity${props.query}${separator}cursor=${encodeURIComponent(cursor)}`,
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRows((shown) => [...shown, ...result.data.rows]);
    setCursor(result.data.nextCursor);
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
        Không có thao tác nào trong bộ lọc này.
      </p>
    );
  }

  const countOf = new Map(props.days.map((day) => [day.date, day.count]));
  const groups: { date: BusinessDate; rows: ActivityRow[] }[] = [];
  for (const row of rows) {
    const date = toBusinessDate(new Date(row.at));
    const last = groups.at(-1);
    if (last?.date === date) last.rows.push(row);
    else groups.push({ date, rows: [row] });
  }

  return (
    <section
      aria-labelledby="activity-table"
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id="activity-table" className="text-label">
          Thao tác
        </h2>
        <p className="text-sm text-muted-foreground">
          Mới nhất trên cùng · bấm một dòng để xem trước / sau
        </p>
      </div>
      <div className="relative overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-3.5 py-2.5 font-semibold">
                Giờ
              </th>
              <th scope="col" className="px-3.5 py-2.5 font-semibold">
                Người làm
              </th>
              <th scope="col" className="px-3.5 py-2.5 font-semibold">
                Thao tác
              </th>
              <th scope="col" className="px-3.5 py-2.5 font-semibold">
                Chứng từ
              </th>
              <th scope="col" className="px-3.5 py-2.5 font-semibold">
                Nội dung
              </th>
              <th scope="col" className="px-3.5 py-2.5">
                <span className="sr-only">Chi tiết</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {groups.map((group) => (
              <Fragment key={group.date}>
                <tr>
                  <th
                    colSpan={6}
                    scope="colgroup"
                    className="bg-accent/40 px-3.5 py-2.5 text-left text-caption font-bold"
                  >
                    {dayHeading(group.date)}{" "}
                    <span className="font-medium text-muted-foreground">
                      · {countOf.get(group.date) ?? group.rows.length} thao tác
                    </span>
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <Row key={row.id} row={row} />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground tabular-nums">
          Đang hiện {rows.length.toLocaleString("vi-VN")} /{" "}
          {props.total.toLocaleString("vi-VN")} thao tác
        </span>
        {cursor ? (
          <Button
            type="button"
            variant="secondary"
            onClick={more}
            disabled={pending}
          >
            {pending ? "Đang tải…" : "Xem thêm"}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
