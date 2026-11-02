// The blue "Tổng chi phí sửa" card of D12.
import { formatMoney, type Money } from "@/domain/money";
import { formatByUnit, type UnitAmount } from "@/domain/quantity";

interface RepairSummaryProps {
  cost: Money;
  /** To Good per unit: "40 cái, 9 bó", never one number (0.2 #47). */
  good: readonly UnitAmount[];
  scrap: readonly UnitAmount[];
  loss: Money;
}

export function RepairSummary({ cost, good, scrap, loss }: RepairSummaryProps) {
  return (
    <section
      aria-label="Tổng chi phí sửa"
      className="relative flex flex-col gap-2 overflow-hidden rounded-lg bg-primary p-5 text-primary-foreground shadow-md"
    >
      <h2 className="text-sm font-semibold">Tổng chi phí sửa</h2>
      <p className="font-display text-h1 tabular-nums">{formatMoney(cost)}</p>
      <p className="text-sm">
        {`${formatByUnit(good)} về Tốt · ${formatByUnit(scrap)} thành phế liệu`}
      </p>
      {loss > 0 ? (
        <p className="text-sm font-semibold">
          Lỗ hỏng hàng {formatMoney(loss)}
        </p>
      ) : null}
    </section>
  );
}
