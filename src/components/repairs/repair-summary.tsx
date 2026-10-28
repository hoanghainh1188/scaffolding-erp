// The blue "Tổng chi phí sửa" card of D12.
import { formatMoney, type Money } from "@/domain/money";
import { formatQuantity, toQuantity } from "@/domain/quantity";

const pieces = (milli: number) => formatQuantity(toQuantity(milli, "PIECE"));

interface RepairSummaryProps {
  cost: Money;
  goodMilli: number;
  scrapMilli: number;
  loss: Money;
}

export function RepairSummary({
  cost,
  goodMilli,
  scrapMilli,
  loss,
}: RepairSummaryProps) {
  return (
    <section
      aria-label="Tổng chi phí sửa"
      className="relative flex flex-col gap-2 overflow-hidden rounded-lg bg-primary p-5 text-primary-foreground shadow-md"
    >
      <h2 className="text-sm font-semibold">Tổng chi phí sửa</h2>
      <p className="font-display text-h1 tabular-nums">{formatMoney(cost)}</p>
      <p className="text-sm">
        {pieces(goodMilli)} cái về Tốt · {pieces(scrapMilli)} cái thành phế liệu
      </p>
      {loss > 0 ? (
        <p className="text-sm font-semibold">
          Lỗ hỏng hàng {formatMoney(loss)}
        </p>
      ) : null}
    </section>
  );
}
