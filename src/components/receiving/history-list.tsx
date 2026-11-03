"use client";

// M7 "Lịch sử phiếu" (spec mobile-history): drafts on this phone first,
// then posted receipts by business day.
import Link from "next/link";

import { DraftList } from "@/components/drafts/draft-list";
import { formatDateTime } from "@/domain/business-date";
import { useDrafts } from "@/hooks/use-drafts";
import type { DeliveriesByDay } from "@/lib/deliveries/queries";
import type { ReturnsByDay } from "@/lib/returns/queries";
import type { ReceiptsByDay } from "@/lib/receiving/queries";
import {
  formatQuantity,
  QUANTITY_UNIT_LABELS,
  toQuantity,
} from "@/domain/quantity";

interface HistoryListProps {
  userId: string;
  /** Null when the role does not receive goods. */
  receipts: ReceiptsByDay | null;
  /** Null when the role does not pick deliveries. */
  deliveries?: DeliveriesByDay | null;
  /** Null when the role does not receive returns. */
  returns?: ReturnsByDay | null;
  /** The filter on the URL: all, receipt, delivery, return. */
  type?: "all" | "receipt" | "delivery" | "return";
  /** The days shown, newest first (both kinds together). */
  dates?: string[];
  /** Day headings, by business date: "Hôm nay, 26/10". */
  dayLabels: Record<string, string>;
  olderHref: string | null;
  now: string;
}

const KIND_SHORT = { NEW: "hàng mới", USED: "hàng cũ" } as const;

const delivered = (
  rows: { unit: keyof typeof QUANTITY_UNIT_LABELS; milli: number }[],
) =>
  rows
    .map(
      (row) =>
        `${formatQuantity(toQuantity(row.milli, row.unit))} ${QUANTITY_UNIT_LABELS[row.unit]}`,
    )
    .join(", ");

export function HistoryList({
  userId,
  receipts,
  deliveries = null,
  returns = null,
  type = "all",
  dates,
  dayLabels,
  olderHref,
  now,
}: HistoryListProps) {
  const allDrafts = useDrafts(userId);
  const drafts =
    allDrafts?.filter((draft) =>
      type === "receipt"
        ? draft.kind === "GOODS_RECEIPT"
        : type === "delivery"
          ? draft.kind === "DELIVERY"
          : type === "return"
            ? draft.kind === "RETURN"
            : true,
    ) ?? null;
  const shownDates =
    dates ??
    [
      ...new Set(
        [
          ...(receipts?.days ?? []),
          ...(deliveries?.days ?? []),
          ...(returns?.days ?? []),
        ].map((day) => day.date),
      ),
    ]
      .sort()
      .reverse();
  const days = shownDates.map((date) => ({
    date,
    receipts: receipts?.days.find((day) => day.date === date)?.receipts ?? [],
    deliveries: deliveries?.days.find((day) => day.date === date)?.notes ?? [],
    returns: returns?.days.find((day) => day.date === date)?.notes ?? [],
  }));
  const empty = drafts !== null && drafts.length === 0 && days.length === 0;
  return (
    <div className="flex flex-col gap-6">
      <DraftList userId={userId} drafts={drafts ?? []} now={new Date(now)} />
      {days.map((day) => (
        <section key={day.date} data-mask className="flex flex-col gap-2">
          <h2 className="text-label text-muted-foreground">
            {dayLabels[day.date]}
          </h2>
          <ul className="flex flex-col divide-y rounded-lg border bg-card">
            {day.receipts.map((receipt) => (
              <li key={receipt.code}>
                <Link
                  href={`/m/receipts/${receipt.code}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-label">Nhập {receipt.code}</span>
                    <span className="truncate text-body text-muted-foreground">
                      {receipt.supplierName} · {KIND_SHORT[receipt.kind]} ·{" "}
                      {receipt.countedItems} mã
                    </span>
                  </span>
                  <span className="text-body text-muted-foreground tabular-nums">
                    {formatDateTime(new Date(receipt.createdAt)).slice(11)}
                  </span>
                </Link>
              </li>
            ))}
            {day.deliveries.map((note) => (
              <li key={note.code}>
                <Link
                  href={`/m/deliveries/${note.code}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-label">Xuất {note.code}</span>
                    <span className="truncate text-body text-muted-foreground">
                      {note.place} · {delivered(note.delivered)}
                    </span>
                  </span>
                  <span className="text-body text-muted-foreground tabular-nums">
                    {formatDateTime(new Date(note.postedAt)).slice(11)}
                  </span>
                </Link>
              </li>
            ))}
            {day.returns.map((note) => (
              <li key={note.code}>
                <Link
                  href={`/m/returns/${note.code}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-label">Thu hồi {note.code}</span>
                    <span className="truncate text-body text-muted-foreground">
                      {note.siteName} · {note.text}
                    </span>
                  </span>
                  <span className="text-body text-muted-foreground tabular-nums">
                    {formatDateTime(new Date(note.postedAt)).slice(11)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {olderHref && (
        <Link
          href={olderHref}
          className="self-start text-label text-primary underline-offset-4 hover:underline"
        >
          Xem các ngày trước
        </Link>
      )}
      {empty && (
        <p className="rounded-lg border bg-card p-4 text-body text-muted-foreground">
          Chưa có phiếu nào. Phiếu bạn làm sẽ hiện ở đây.
        </p>
      )}
    </div>
  );
}
