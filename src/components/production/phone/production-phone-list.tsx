// The production cards of /m/production and M1 (spec production-mobile,
// mobile-home "Sản xuất trên Việc hôm nay"). No price.
import Link from "next/link";

import { ToneBadge } from "@/components/domain/tone-badge";
import { Button } from "@/components/ui/button";
import { formatByUnit } from "@/domain/quantity";
import type { ProductionPhoneCard } from "@/lib/production/phone-queries";

const ACTION: Readonly<Record<string, string>> = {
  ASSIGNED: "Nhận lệnh",
  IN_PROGRESS: "Tiếp tục",
  AWAITING_CHECK: "Đếm thành phẩm",
};

/** "LSX-2026-004 · tổ anh Lực · XUONG-01 → BAI-01 · 300 cái". */
export function productionCardTitle(card: ProductionPhoneCard): string {
  return [
    card.code,
    card.team,
    `${card.workshopCode} → ${card.toCode}`,
    formatByUnit(card.planned),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ProductionPhoneCards({
  cards,
}: {
  cards: ProductionPhoneCard[];
}) {
  return (
    <ul className="flex flex-col gap-3">
      {cards.map((card) => (
        <li key={card.code}>
          <article
            aria-label={card.code}
            className="flex flex-col gap-3 rounded-lg border bg-card p-4"
          >
            <p className="text-label">{productionCardTitle(card)}</p>
            {card.returnNote ? (
              <ToneBadge tone="warning" className="self-start">
                Văn phòng trả lại
              </ToneBadge>
            ) : null}
            <Button asChild className="h-12">
              <Link href={`/m/production/${card.code}`}>
                {ACTION[card.status]}
              </Link>
            </Button>
          </article>
        </li>
      ))}
    </ul>
  );
}
