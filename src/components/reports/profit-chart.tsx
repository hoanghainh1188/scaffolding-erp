// "Theo tháng" of D15 (spec management-reports "Biểu đồ doanh thu và lợi
// nhuận theo tháng"): revenue as a wide light bar, gross profit as a narrow
// primary bar in it, the profit in millions above. A loss goes under the
// zero line. SVG with tokens, no chart library; the numbers are also in a
// list for screen readers.
import { Panel } from "@/components/dashboard/panel";
import { monthShort } from "@/components/dashboard/format";
import { millionsText } from "@/domain/dashboard";
import type { MonthProfit } from "@/domain/gross-profit";
import { REVENUE_PARTS, COST_CATEGORIES } from "@/domain/gross-profit";
import { cn } from "@/lib/utils";

const HEIGHT = 180;
const SLOT = 64;
const TOP = 22;
const BOTTOM = 24;

export interface ChartMonth {
  month: string;
  revenue: number;
  profit: number;
  provisional: boolean;
}

export function chartMonths(rows: readonly MonthProfit[]): ChartMonth[] {
  return rows.map((row) => {
    const revenue = REVENUE_PARTS.reduce(
      (sum, part) => sum + row.revenue[part],
      0,
    );
    const costs = COST_CATEGORIES.reduce(
      (sum, category) => sum + row.costs[category],
      0,
    );
    return {
      month: row.month,
      revenue,
      profit: revenue - costs,
      provisional: row.provisional,
    };
  });
}

function scaleOf(months: readonly ChartMonth[]) {
  const up = Math.max(0, ...months.flatMap((m) => [m.revenue, m.profit]));
  const down = Math.max(0, ...months.flatMap((m) => [-m.revenue, -m.profit]));
  const span = up + down || 1;
  return {
    zero: TOP + (HEIGHT * up) / span,
    px: (value: number) => (HEIGHT * Math.abs(value)) / span,
  };
}

const millions = (amount: number) => millionsText(amount).replace(" tr", "");

export function ProfitChart({
  year,
  months,
}: {
  year: number;
  months: readonly ChartMonth[];
}) {
  const { zero, px } = scaleOf(months);
  const width = Math.max(months.length, 1) * SLOT;
  const last = months.at(-1)?.month;
  const bar = (value: number, x: number, w: number, className: string) => {
    if (value === 0) return null;
    const h = px(value);
    return (
      <rect
        x={x}
        y={value > 0 ? zero - h : zero}
        width={w}
        height={h}
        rx={4}
        className={className}
      />
    );
  };
  return (
    <Panel
      id="mon"
      title={`Theo tháng năm ${year}`}
      actions={
        <span className="flex gap-4 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-[3px] bg-accent" />
            Doanh thu
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-[3px] bg-primary" />
            Lợi nhuận gộp (triệu ₫)
          </span>
        </span>
      }
      note={
        months.some((month) => month.provisional)
          ? "* tháng có tiền thuê tạm tính (kỳ chưa chốt)."
          : undefined
      }
    >
      <figure className="flex flex-col gap-2">
        <svg
          viewBox={`0 0 ${width} ${TOP + HEIGHT + BOTTOM}`}
          className="h-auto max-h-[240px] w-full"
          aria-hidden
        >
          <line
            x1={0}
            x2={width}
            y1={zero}
            y2={zero}
            className="stroke-border"
            strokeWidth={1}
          />
          {months.map((month, index) => {
            const x = index * SLOT;
            const top =
              zero -
              Math.max(
                px(Math.max(0, month.revenue)),
                px(Math.max(0, month.profit)),
              );
            return (
              <g key={month.month}>
                {bar(month.revenue, x + 14, 36, "fill-accent")}
                {bar(month.profit, x + 20, 24, "fill-primary")}
                <text
                  x={x + SLOT / 2}
                  y={Math.max(12, top - 6)}
                  textAnchor="middle"
                  className="fill-foreground text-[12px] font-semibold"
                >
                  {millions(month.profit)}
                </text>
                <text
                  x={x + SLOT / 2}
                  y={TOP + HEIGHT + 18}
                  textAnchor="middle"
                  className={cn(
                    "text-[13px]",
                    month.month === last
                      ? "fill-foreground font-bold"
                      : "fill-muted-foreground",
                  )}
                >
                  {monthShort(month.month)}
                  {month.provisional ? "*" : ""}
                </text>
              </g>
            );
          })}
        </svg>
        <figcaption className="sr-only">
          Doanh thu và lợi nhuận gộp theo tháng năm {year}
        </figcaption>
        <ul
          aria-label="Doanh thu và lợi nhuận gộp theo tháng"
          className="sr-only"
        >
          {months.map((month) => (
            <li key={month.month}>
              {monthShort(month.month)}
              {month.provisional ? " (tạm tính)" : ""}: doanh thu{" "}
              {month.revenue.toLocaleString("vi-VN")} đồng, lợi nhuận gộp{" "}
              {month.profit.toLocaleString("vi-VN")} đồng
            </li>
          ))}
        </ul>
      </figure>
    </Panel>
  );
}
