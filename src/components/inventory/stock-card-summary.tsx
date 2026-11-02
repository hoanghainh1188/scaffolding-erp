import { CONDITION_LABELS, type Condition } from "@/domain/condition";
import { formatMoney, toMoney } from "@/domain/money";
import {
  QUANTITY_UNIT_LABELS,
  hasStandardWeight,
  toQuantity,
  type QuantityUnit,
  quantityFromDb,
} from "@/domain/quantity";
import { unitsToKg } from "@/domain/weight-conversion";
import type { StockCard } from "@/lib/inventory/card";

import { formatStock } from "./format";

interface StockCardSummaryProps {
  card: StockCard;
  condition: Condition | null;
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <dt className="text-caption font-semibold text-muted-foreground">
        {label}
      </dt>
      <dd className={`font-display text-h1 ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}

/** D11 period figures and the current average (spec stock-views). */
export function StockCardSummary({ card, condition }: StockCardSummaryProps) {
  const unit: QuantityUnit = card.item.unit;
  const scrapKg =
    condition === "SCRAP" &&
    hasStandardWeight(unit) &&
    card.item.standardWeightKg
      ? unitsToKg(
          toQuantity(card.closing, unit),
          quantityFromDb(card.item.standardWeightKg, "KG"),
        ).milli
      : null;
  return (
    <div className="flex flex-wrap gap-4">
      <section
        aria-label="Tổng hợp kỳ"
        className="flex-[3_1_520px] rounded-lg border bg-card px-6 py-5"
      >
        <dl className="flex flex-wrap gap-x-10 gap-y-4 tabular-nums">
          <Figure label="Tồn đầu kỳ" value={formatStock(card.opening, unit)} />
          <Figure
            label="Nhập trong kỳ"
            value={`+${formatStock(card.inflow, unit)}`}
            tone="text-success"
          />
          <Figure
            label="Xuất trong kỳ"
            value={`−${formatStock(card.outflow, unit)}`}
          />
          <div>
            <dt className="text-caption font-semibold text-muted-foreground">
              Tồn cuối kỳ
            </dt>
            <dd className="font-display text-h1">
              {formatStock(card.closing, unit)}
              {scrapKg !== null ? (
                <span className="ml-2 font-sans text-sm font-medium text-muted-foreground">
                  ≈ {formatStock(scrapKg, "KG")} kg
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </section>
      {condition ? (
        <section
          aria-labelledby="avg-cost"
          className="relative flex flex-[1_1_260px] flex-col gap-1 overflow-hidden rounded-xl bg-primary px-6 py-5 text-primary-foreground"
        >
          <div
            aria-hidden
            className="absolute -right-9 -bottom-11 size-28 rounded-full bg-highlight"
          />
          <h2 id="avg-cost" className="relative text-sm font-semibold">
            Giá vốn bình quân hiện tại
          </h2>
          <p className="relative font-display text-display tabular-nums">
            {card.currentAvg === null
              ? "–"
              : formatMoney(toMoney(card.currentAvg))}
          </p>
          <p className="relative text-sm">
            mỗi {QUANTITY_UNIT_LABELS[unit]}, tình trạng{" "}
            {CONDITION_LABELS[condition]}
          </p>
        </section>
      ) : null}
    </div>
  );
}
