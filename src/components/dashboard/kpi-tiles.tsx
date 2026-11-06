// The four numbers at the top of D1 (spec dashboard; bản vẽ Main.dc.html):
// overdue debt in the primary colour, revenue of the month, goods on site,
// risky sites. A viewer without a block gets no tile for it (design D1).
import Link from "next/link";
import type { ReactNode } from "react";

import type { MonthRevenue } from "@/domain/dashboard";
import type { OverdueSummary } from "@/lib/dashboard/overdue";
import type { OnSiteSummary } from "@/lib/dashboard/stock";

import { money, monthName, pieces, tons } from "./format";

interface TileProps {
  label: string;
  value: ReactNode;
  note: ReactNode;
  tone?: "warning";
}

function Tile({ label, value, note, tone }: TileProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-card px-5 py-4">
      <span className="text-caption font-semibold text-muted-foreground">
        {label}
      </span>
      <span
        className={
          tone === "warning"
            ? "font-display text-2xl leading-[30px] font-bold text-warning tabular-nums"
            : "font-display text-2xl leading-[30px] font-bold tabular-nums"
        }
        data-mask
      >
        {value}
      </span>
      <span
        className="text-[13px] leading-[18px] text-muted-foreground"
        data-mask
      >
        {note}
      </span>
    </div>
  );
}

export function OverdueTile({ overdue }: { overdue: OverdueSummary }) {
  return (
    <section
      aria-labelledby="kpi-overdue"
      className="relative flex flex-col gap-1.5 overflow-hidden rounded-xl bg-primary p-6 text-primary-foreground"
    >
      <span
        aria-hidden
        className="absolute -right-12 -bottom-14 size-[120px] rounded-pill bg-highlight"
      />
      <h2 id="kpi-overdue" className="text-[15px] leading-[22px] font-semibold">
        Công nợ quá hạn
      </h2>
      <p className="font-display text-display tabular-nums" data-mask>
        {money(overdue.amount)}
      </p>
      <p className="relative pr-16 text-label font-normal tabular-nums">
        <span data-mask>
          {overdue.customers > 0
            ? `${overdue.customers} nhà thầu · lâu nhất ${overdue.longestDays} ngày`
            : "Không có nhà thầu quá hạn"}
        </span>
        {" · "}
        <Link
          href="/receivables?filter=overdue"
          className="font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground"
        >
          Xem công nợ
        </Link>
      </p>
    </section>
  );
}

export function RevenueTile({ month }: { month: MonthRevenue }) {
  return (
    <Tile
      label={`Doanh số ${monthName(month.month)}`}
      value={money(month.total)}
      note={`Thuê ${money(month.rent)} tạm tính · bán ${money(month.sale)}`}
    />
  );
}

export function OnSiteTile({ onSite }: { onSite: OnSiteSummary }) {
  return (
    <Tile
      label="Hàng ở ngoài"
      value={pieces(onSite.total.piecesMilli)}
      note={`${tons(onSite.total.kgMilli)} · ${onSite.total.siteCount} công trình`}
    />
  );
}

export function RiskTile({ count }: { count: number }) {
  return (
    <Tile
      label="Công trình rủi ro"
      value={count}
      note="Nợ quá hạn, hàng mất, quá hạn hợp đồng"
      tone={count > 0 ? "warning" : undefined}
    />
  );
}
