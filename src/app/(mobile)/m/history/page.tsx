import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { HistoryList } from "@/components/receiving/history-list";
import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { getDatabase } from "@/db/client";
import {
  addDays,
  isBusinessDate,
  toBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";
import { can } from "@/domain/permissions";
import { requireUser } from "@/lib/auth/guard";
import { deliveriesByDay } from "@/lib/deliveries/queries";
import { receiptsByDay } from "@/lib/receiving/queries";
import { returnsByDay } from "@/lib/returns/queries";
import { transfersByDay } from "@/lib/site-transfers/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Lịch sử" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const TYPES = [
  { key: "all", label: "Tất cả" },
  { key: "receipt", label: "Nhập" },
  { key: "delivery", label: "Xuất" },
  { key: "return", label: "Thu hồi" },
  { key: "transfer", label: "Chuyển" },
] as const;

function dayLabel(date: BusinessDate, today: BusinessDate): string {
  const [year, month, day] = date.split("-");
  const short = `${day}/${month}`;
  if (date === today) return `Hôm nay, ${short}`;
  if (date === addDays(today, -1)) return `Hôm qua, ${short}`;
  return `${short}/${year}`;
}

/** M7 (spec mobile-history): receipts, deliveries, returns, transfers by day. */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  await connection();
  const now = new Date();
  const today = toBusinessDate(now);
  const params = await searchParams;
  const type =
    params.type === "receipt" ||
    params.type === "delivery" ||
    params.type === "return" ||
    params.type === "transfer"
      ? params.type
      : "all";
  const before =
    typeof params.before === "string" && isBusinessDate(params.before)
      ? params.before
      : undefined;
  const page = { ...(before ? { before } : {}), days: before ? 7 : 2 };
  const shows = (kind: "receipt" | "delivery" | "return" | "transfer") =>
    type === "all" || type === kind;
  const receipts =
    shows("receipt") && can(user.role, "receiving.manage")
      ? await receiptsByDay(getDatabase(), page)
      : null;
  const deliveries =
    shows("delivery") && can(user.role, "deliveries.pick")
      ? await deliveriesByDay(getDatabase(), page)
      : null;
  const returns =
    shows("return") && can(user.role, "returns.receive")
      ? await returnsByDay(getDatabase(), page)
      : null;
  const transfers =
    shows("transfer") && can(user.role, "deliveries.pick")
      ? await transfersByDay(getDatabase(), page)
      : null;
  // Both kinds on one list: the newest days of either, older ones paged.
  const union = [
    ...new Set(
      [
        ...(receipts?.days ?? []),
        ...(deliveries?.days ?? []),
        ...(returns?.days ?? []),
        ...(transfers?.days ?? []),
      ].map((day) => day.date),
    ),
  ]
    .sort()
    .reverse();
  const dates = union.slice(0, page.days);
  const oldest = dates.at(-1);
  const hasMore =
    Boolean(receipts?.hasMore) ||
    Boolean(deliveries?.hasMore) ||
    Boolean(returns?.hasMore) ||
    Boolean(transfers?.hasMore) ||
    union.length > dates.length;
  const olderHref =
    hasMore && oldest
      ? `/m/history?${new URLSearchParams({ ...(type !== "all" ? { type } : {}), before: oldest })}`
      : null;
  const dayLabels = Object.fromEntries(
    dates.map((date) => [date, dayLabel(date as BusinessDate, today)]),
  );
  return (
    <MobilePage title="Lịch sử phiếu">
      <nav aria-label="Loại phiếu" className="flex gap-2">
        {TYPES.map((option) => (
          <Link
            key={option.key}
            href={
              option.key === "all"
                ? "/m/history"
                : `/m/history?type=${option.key}`
            }
            aria-current={type === option.key ? "page" : undefined}
            className={cn(
              "flex h-10 items-center rounded-full border px-4 text-label",
              type === option.key ? "border-primary bg-accent" : "bg-card",
            )}
          >
            {option.label}
          </Link>
        ))}
      </nav>
      <HistoryList
        userId={user.id}
        receipts={receipts}
        deliveries={deliveries}
        returns={returns}
        transfers={transfers}
        type={type}
        dates={dates}
        dayLabels={dayLabels}
        olderHref={olderHref}
        now={now.toISOString()}
      />
    </MobilePage>
  );
}
