// The repair cards of /m/repairs and M1 (spec repair-mobile "Danh sách lệnh
// trên điện thoại", mobile-home "Sửa chữa trên Việc hôm nay"). No price.
import Link from "next/link";

import { ToneBadge } from "@/components/domain/tone-badge";
import { Button } from "@/components/ui/button";
import { formatByUnit } from "@/domain/quantity";
import type { PhoneOrderCard } from "@/lib/repairs/phone-queries";

const ACTION: Readonly<Record<string, string>> = {
  ASSIGNED: "Nhận lệnh",
  IN_PROGRESS: "Tiếp tục",
  AWAITING_CHECK: "Đếm nghiệm thu",
};

/** "PSC-2026-031 · tổ anh Lực · BAI-01 → XUONG-01 · 2 mã · 60 cái". */
export function cardTitle(card: PhoneOrderCard): string {
  return [
    card.code,
    card.repairedBy,
    `${card.fromCode} → ${card.workshopCode}`,
    `${card.lineCount} mã`,
    formatByUnit(card.taken),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function RepairPhoneCards({ cards }: { cards: PhoneOrderCard[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {cards.map((card) => (
        <li key={card.code}>
          <article
            aria-label={card.code}
            className="flex flex-col gap-3 rounded-lg border bg-card p-4"
          >
            <p className="text-label">{cardTitle(card)}</p>
            {card.returnNote ? (
              <ToneBadge tone="warning" className="self-start">
                Văn phòng trả lại
              </ToneBadge>
            ) : null}
            <Button asChild className="h-12">
              <Link href={`/m/repairs/${card.code}`}>
                {ACTION[card.status]}
              </Link>
            </Button>
          </article>
        </li>
      ))}
    </ul>
  );
}
