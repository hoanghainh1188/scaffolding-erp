// Stacked bars of D1 "Doanh số" (design D7): rent below, sale on top;
// a negative day (a negative adjustment, 0.2 #80) goes under the zero line,
// never cut to zero. Drawn in SVG with tokens; the numbers are also in a
// list for screen readers.
import { cn } from "@/lib/utils";

export interface ChartBar {
  key: string;
  label: string;
  rent: number;
  sale: number;
  /** Value above the bar ("278,4 tr"); none on the day view. */
  valueText?: string;
  provisional?: boolean;
  current?: boolean;
}

const HEIGHT = 200;
const SLOT = 64;
const TOP = 24;
const BOTTOM = 24;

function scaleOf(bars: readonly ChartBar[]) {
  const up = Math.max(
    0,
    ...bars.map((bar) => Math.max(0, bar.rent) + Math.max(0, bar.sale)),
  );
  const down = Math.max(
    0,
    ...bars.map((bar) => -(Math.min(0, bar.rent) + Math.min(0, bar.sale))),
  );
  const span = up + down || 1;
  const zero = TOP + (HEIGHT * up) / span;
  return { zero, px: (value: number) => (HEIGHT * Math.abs(value)) / span };
}

export function RevenueChart({
  bars,
  label,
}: {
  bars: readonly ChartBar[];
  label: string;
}) {
  const { zero, px } = scaleOf(bars);
  const width = bars.length * SLOT;
  const barWidth = bars.length > 12 ? 14 : 40;
  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${TOP + HEIGHT + BOTTOM}`}
        className="h-auto max-h-[260px] w-full"
        aria-hidden
        data-mask
      >
        <line
          x1={0}
          x2={width}
          y1={zero}
          y2={zero}
          className="stroke-border"
          strokeWidth={1}
        />
        {bars.map((bar, index) => {
          const x = index * SLOT + (SLOT - barWidth) / 2;
          const parts = [
            { kind: "rent", value: bar.rent },
            { kind: "sale", value: bar.sale },
          ] as const;
          let above = zero;
          let below = zero;
          return (
            <g key={bar.key}>
              {parts.map((part) => {
                if (part.value === 0) return null;
                const h = px(part.value);
                const y = part.value > 0 ? above - h : below;
                if (part.value > 0) above -= h;
                else below += h;
                return (
                  <rect
                    key={part.kind}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={h}
                    className={cn(
                      part.kind === "sale" ? "fill-highlight" : "fill-primary",
                      part.kind === "rent" && bar.provisional && "opacity-45",
                    )}
                  />
                );
              })}
              {bar.valueText ? (
                <text
                  x={index * SLOT + SLOT / 2}
                  y={Math.max(12, above - 6)}
                  textAnchor="middle"
                  className="fill-foreground text-[12px] font-semibold"
                >
                  {bar.valueText}
                </text>
              ) : null}
              <text
                x={index * SLOT + SLOT / 2}
                y={TOP + HEIGHT + 18}
                textAnchor="middle"
                className={cn(
                  "text-[13px]",
                  bar.current
                    ? "fill-foreground font-bold"
                    : "fill-muted-foreground",
                )}
              >
                {bar.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">{label}</figcaption>
      <ul className="sr-only">
        {bars.map((bar) => (
          <li key={bar.key}>
            {bar.label}: thuê {bar.rent.toLocaleString("vi-VN")} đồng, bán{" "}
            {bar.sale.toLocaleString("vi-VN")} đồng
          </li>
        ))}
      </ul>
    </figure>
  );
}
