// One "Giá vốn sau sửa" card of D12 (spec "Màn D12 phiếu sửa chữa").
import { lineAmount } from "@/domain/average-cost";
import { formatMoney, type Money } from "@/domain/money";
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import { perRepairedPiece } from "@/domain/repair-order";

import type { LineFigures } from "./preview";

const units = (milli: number, unit: QuantityUnit) =>
  formatQuantity(toQuantity(milli, unit));
/** "4 cái", "2 bó". */
const withUnit = (milli: number, unit: QuantityUnit) =>
  `${units(milli, unit)} ${QUANTITY_UNIT_LABELS[unit]}`;
const kg = (milli: number) => formatQuantity(toQuantity(milli, "KG"));

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: Money;
  strong?: boolean;
}) {
  return (
    <div
      className={
        strong
          ? "flex justify-between gap-4 border-t pt-2 font-semibold"
          : "flex justify-between gap-4"
      }
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{formatMoney(value)}</dd>
    </div>
  );
}

/** "4 cái hỏng hẳn vào Phế liệu theo giá sắt vụn 405.000 ₫ (54 kg × 7.500 ₫)". */
export function scrapSentence(figures: LineFigures): string {
  const count = `${withUnit(figures.scrapMilli, figures.unit)} hỏng hẳn vào Phế liệu`;
  const value = formatMoney(figures.scrapValue);
  const price = figures.scrapPricePerKg;
  // V = min(kg × price, pieces × B): say which side won.
  if (
    price !== null &&
    lineAmount(figures.scrapKgMilli, price) === figures.scrapValue
  ) {
    return `${count} theo giá sắt vụn ${value} (${kg(figures.scrapKgMilli)} kg × ${formatMoney(price)})`;
  }
  return `${count} theo giá vốn Chờ sửa ${value}, vì giá sắt vụn cao hơn.`;
}

export function CostBlock({ figures }: { figures: LineFigures }) {
  const good = figures.goodMilli;
  const title =
    good > 0
      ? `${figures.itemName} · ${withUnit(good, figures.unit)} sửa xong`
      : `${figures.itemName} · ${withUnit(figures.scrapMilli, figures.unit)} hỏng hẳn`;
  return (
    <article
      aria-label={`Giá vốn sau sửa ${figures.itemCode}`}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
    >
      <h3 className="font-semibold">{title}</h3>
      {good > 0 ? (
        <dl className="flex flex-col gap-1.5 text-sm">
          <Row label="Giá vốn Chờ sửa" value={figures.needsRepairAvg} />
          <Row
            label={`+ Chi phí sửa (${formatMoney(figures.repairCost)} ÷ ${units(good, figures.unit)})`}
            value={perRepairedPiece(figures.repairCost, good)}
          />
          {figures.damage > 0 ? (
            <Row
              label={`+ Phần hỏng gánh thêm (${formatMoney(figures.damage)} ÷ ${units(good, figures.unit)})`}
              value={perRepairedPiece(figures.damage, good)}
            />
          ) : null}
          {figures.goodUnitCost !== null ? (
            <Row
              label="= Giá vốn khi vào Tốt"
              value={figures.goodUnitCost}
              strong
            />
          ) : null}
          {figures.goodAvgAfter !== null ? (
            <div className="flex justify-between gap-4 font-semibold text-primary">
              <dt>
                Giá vốn BQ Tốt:{" "}
                {figures.goodAvgBefore === null
                  ? "chưa có"
                  : formatMoney(figures.goodAvgBefore)}{" "}
                →
              </dt>
              <dd className="tabular-nums">
                {formatMoney(figures.goodAvgAfter)}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <p className="text-caption text-muted-foreground">
        {figures.scrapMilli > 0 ? scrapSentence(figures) : "Không có phế liệu."}
      </p>
      {figures.loss > 0 ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
          Lỗ hỏng hàng: {formatMoney(figures.loss)}
        </p>
      ) : null}
    </article>
  );
}
