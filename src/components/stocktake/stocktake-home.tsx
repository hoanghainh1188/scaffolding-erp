"use client";

// M1 "Kiểm kê" (spec mobile-home "Kiểm kê trên Việc hôm nay"): one card per
// open session; the draft on this phone shows how far the count got.
import Link from "next/link";

import { ToneBadge } from "@/components/domain/tone-badge";
import { Button } from "@/components/ui/button";
import { useDrafts } from "@/hooks/use-drafts";
import type { OpenStocktake } from "@/lib/stocktakes/queries";

interface StocktakeHomeProps {
  sessions: OpenStocktake[];
  userId: string;
}

export function StocktakeHome({ sessions, userId }: StocktakeHomeProps) {
  const drafts = useDrafts(userId) ?? [];
  return (
    <section
      aria-labelledby="stocktake-title"
      data-mask
      className="flex flex-col gap-3"
    >
      <h2 id="stocktake-title" className="text-h3">
        Kiểm kê
      </h2>
      {sessions.map((session) => {
        const href = `/m/stocktake/${encodeURIComponent(session.code)}`;
        const draft = drafts.find(
          (row) => row.kind === "STOCKTAKE" && row.documentRef === session.code,
        );
        const progress =
          draft?.progress.replace(" đã đếm", "").replace("/", " / ") ??
          `${session.counted} / ${session.total} dòng`;
        return (
          <article
            key={session.code}
            aria-label={session.code}
            className="flex flex-col gap-3 rounded-lg border bg-card p-4"
          >
            <div className="flex flex-col gap-1">
              <p className="text-label">
                {session.code} · {session.locationCode} · {session.locationName}
              </p>
              {session.status === "SUBMITTED" ? (
                <p className="text-body text-muted-foreground">
                  Chờ Giám đốc duyệt
                </p>
              ) : session.recountLines > 0 ? (
                <ToneBadge tone="warning" className="self-start">
                  Cần đếm lại {session.recountLines} dòng
                </ToneBadge>
              ) : session.returnedReason ? (
                <p className="text-body text-warning">
                  Bị trả lại: {session.returnedReason}
                </p>
              ) : (
                <p className="text-body text-muted-foreground">
                  Đang đếm · {progress}
                </p>
              )}
            </div>
            {session.status === "COUNTING" && (
              <Button asChild className="h-12">
                <Link href={href}>
                  {session.recountLines > 0 ? "Đếm lại" : "Tiếp tục đếm"}
                </Link>
              </Button>
            )}
          </article>
        );
      })}
      <Button asChild variant="outline" className="h-12">
        <Link href="/m/stocktake/new">Bắt đầu kiểm kê</Link>
      </Button>
    </section>
  );
}
