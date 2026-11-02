// The blue "Tổng chi phí sửa" card of D12.
import { formatMoney, type Money } from "@/domain/money";
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";

const whole = (milli: number) => formatQuantity(toQuantity(milli, "PIECE"));

/**
 * " cái" when every line shares one unit (or there is none yet); nothing
 * when the slip mixes units, so cái and bó are never labelled as one.
 */
function unitSuffix(units: readonly QuantityUnit[]): string {
  const distinct = new Set(units);
  if (distinct.size > 1) return "";
  const [unit = "PIECE"] = distinct;
  return ` ${QUANTITY_UNIT_LABELS[unit]}`;
}

interface RepairSummaryProps {
  cost: Money;
  goodMilli: number;
  scrapMilli: number;
  /** Units of the lines in the totals. */
  units: readonly QuantityUnit[];
  loss: Money;
}

export function RepairSummary({
  cost,
  goodMilli,
  scrapMilli,
  units,
  loss,
}: RepairSummaryProps) {
  const suffix = unitSuffix(units);
  return (
    <section
      aria-label="Tổng chi phí sửa"
      className="relative flex flex-col gap-2 overflow-hidden rounded-lg bg-primary p-5 text-primary-foreground shadow-md"
    >
      <h2 className="text-sm font-semibold">Tổng chi phí sửa</h2>
      <p className="font-display text-h1 tabular-nums">{formatMoney(cost)}</p>
      <p className="text-sm">
        {`${whole(goodMilli)}${suffix} về Tốt · ${whole(scrapMilli)}${suffix} thành phế liệu`}
      </p>
      {loss > 0 ? (
        <p className="text-sm font-semibold">
          Lỗ hỏng hàng {formatMoney(loss)}
        </p>
      ) : null}
    </section>
  );
}
