"use client";

// M1 "Xe sắp về bãi" (spec mobile-home, design D7): one card per order in
// progress; a draft on this phone turns the button into "Tiếp tục nhập".
import Link from "next/link";

import { draftHref } from "@/components/drafts/draft-links";
import { ToneBadge } from "@/components/domain/tone-badge";
import { Button } from "@/components/ui/button";
import { useDrafts } from "@/hooks/use-drafts";
import type { ArrivalCard } from "@/lib/receiving/queries";
import { dict } from "@/locales";

interface ArrivalListProps {
  cards: ArrivalCard[];
  later: number;
  userId: string;
}

const KIND_SHORT = dict.receiving.home.kindShort;

export function ArrivalList({ cards, later, userId }: ArrivalListProps) {
  const drafts = useDrafts(userId) ?? [];
  return (
    <section
      aria-labelledby="arrivals-title"
      data-mask
      className="flex flex-col gap-3"
    >
      <h2 id="arrivals-title" className="text-h3">
        {dict.receiving.home.arrivalsHeader}
      </h2>
      {cards.map((card) => {
        const draft = drafts.find(
          (row) =>
            row.kind === "GOODS_RECEIPT" && row.documentRef === card.code,
        );
        const late = card.label.day === "LATE";
        return (
          <article
            key={card.code}
            aria-label={card.code}
            className="flex flex-col gap-3 rounded-lg border bg-card p-4"
          >
            <div className="flex items-start gap-3">
              {late ? (
                <ToneBadge tone="warning">{card.label.text}</ToneBadge>
              ) : (
                <span className="text-h3 font-display tabular-nums">
                  {card.label.text}
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="truncate text-label">
                  {card.code} · {card.supplierName}
                </p>
                <p className="text-body text-muted-foreground">
                  {card.vehicle ? `Xe ${card.vehicle} · ` : ""}
                  {card.openLines} mã {KIND_SHORT[card.kind]}
                </p>
                {card.waiting && (
                  <p className="text-body">
                    {dict.receiving.home.waitingRest(card.waiting)}
                  </p>
                )}
              </div>
            </div>
            <Button
              asChild
              className="h-12"
              variant={draft ? "secondary" : "default"}
            >
              <Link
                href={
                  draft
                    ? draftHref(draft)
                    : `/m/receive/${encodeURIComponent(card.code)}`
                }
                aria-label={`${draft ? dict.receiving.home.continueReceiving : dict.receiving.home.startReceiving} ${card.code}`}
              >
                {draft
                  ? dict.receiving.home.continueReceiving
                  : dict.receiving.home.startReceiving}
              </Link>
            </Button>
          </article>
        );
      })}
      {later > 0 && (
        <Button asChild variant="ghost" className="h-12 self-start">
          <Link href="/m?later=1">{dict.receiving.home.viewLater(later)}</Link>
        </Button>
      )}
    </section>
  );
}
