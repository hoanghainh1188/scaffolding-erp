import { ConditionBadge } from "@/components/domain/condition-badge";
import { formatMoney, toMoney } from "@/domain/money";
import type { StockCards as Cards } from "@/lib/inventory/stock";

import { formatByUnit, formatStock } from "./format";

/** The three figures over D10 (spec stock-views "Thẻ số đầu D10"). */
export function StockCards({ cards }: { cards: Cards }) {
  return (
    <div className="flex flex-wrap gap-4">
      <section
        aria-labelledby="stock-value"
        className="relative flex flex-[2_1_360px] flex-col gap-1.5 overflow-hidden rounded-xl bg-primary p-6 text-primary-foreground"
      >
        <div
          aria-hidden
          className="absolute -top-16 -right-12 size-36 rounded-full bg-highlight"
        />
        <h2 id="stock-value" className="relative text-base font-semibold">
          Giá trị hàng tồn
        </h2>
        <p
          data-mask
          className="relative font-display text-display tabular-nums"
        >
          {formatMoney(toMoney(cards.totalValue))}
        </p>
        <p className="relative text-sm">
          Tính theo giá vốn bình quân, gồm cả hàng đang ở công trình.
        </p>
      </section>
      <section
        aria-label="Chờ sửa"
        className="flex flex-[1_1_220px] flex-col gap-1.5 rounded-lg border bg-card p-5"
      >
        <ConditionBadge condition="NEEDS_REPAIR" className="self-start" />
        <p data-mask className="font-display text-h1 tabular-nums">
          {formatByUnit(cards.needsRepair)}
        </p>
        <p className="text-sm text-muted-foreground">Tại bãi và xưởng</p>
      </section>
      <section
        aria-label="Phế liệu tại bãi"
        className="flex flex-[1_1_220px] flex-col gap-1.5 rounded-lg border bg-card p-5"
      >
        <ConditionBadge condition="SCRAP" className="self-start" />
        <p data-mask className="font-display text-h1 tabular-nums">
          {formatStock(cards.scrapKgMilli, "KG")} kg
        </p>
        <p data-mask className="text-sm text-muted-foreground">
          {Object.values(cards.converted).some((milli) => milli !== 0)
            ? `gồm ${formatStock(cards.convertedKgMilli, "KG")} kg quy đổi từ ${formatByUnit(cards.converted)}`
            : "Phế liệu tại bãi"}
        </p>
      </section>
    </div>
  );
}
