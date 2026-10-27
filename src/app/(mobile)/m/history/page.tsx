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
import { receiptsByDay } from "@/lib/receiving/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Lịch sử" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const TYPES = [
  { key: "all", label: "Tất cả" },
  { key: "receipt", label: "Nhập" },
] as const;

function dayLabel(date: BusinessDate, today: BusinessDate): string {
  const [year, month, day] = date.split("-");
  const short = `${day}/${month}`;
  if (date === today) return `Hôm nay, ${short}`;
  if (date === addDays(today, -1)) return `Hôm qua, ${short}`;
  return `${short}/${year}`;
}

/** M7 (spec mobile-history). Xuất and Thu hồi join when they exist. */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  await connection();
  const now = new Date();
  const today = toBusinessDate(now);
  const params = await searchParams;
  const type = params.type === "receipt" ? "receipt" : "all";
  const before =
    typeof params.before === "string" && isBusinessDate(params.before)
      ? params.before
      : undefined;
  const receipts = can(user.role, "receiving.manage")
    ? await receiptsByDay(getDatabase(), {
        ...(before ? { before } : {}),
        days: before ? 7 : 2,
      })
    : null;
  const oldest = receipts?.days.at(-1)?.date;
  const olderHref =
    receipts?.hasMore && oldest
      ? `/m/history?${new URLSearchParams({ ...(type === "receipt" ? { type } : {}), before: oldest })}`
      : null;
  const dayLabels = Object.fromEntries(
    (receipts?.days ?? []).map((day) => [day.date, dayLabel(day.date, today)]),
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
        dayLabels={dayLabels}
        olderHref={olderHref}
        now={now.toISOString()}
      />
    </MobilePage>
  );
}
