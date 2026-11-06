// The four numbers of D15 (spec management-reports "Bốn ô số đầu trang",
// "So với kỳ trước ở ô Doanh thu"; bản vẽ D15-Reports.dc.html).
import type { ReactNode } from "react";

import { money } from "@/components/dashboard/format";
import { tonsText } from "@/domain/dashboard";
import {
  averageKgMilli,
  hundredthsText,
  lossPer100,
  utilizationTenths,
} from "@/domain/fleet-metrics";
import { marginText, percentText } from "@/domain/gross-profit";
import type { Report } from "@/lib/reports/report";
import { cn } from "@/lib/utils";

function Tile(props: {
  label: string;
  value: ReactNode;
  note: ReactNode;
  tone?: "primary" | "warning";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-card px-5 py-4">
      <span className="text-caption font-semibold text-muted-foreground">
        {props.label}
      </span>
      <span
        className={cn(
          "font-display text-2xl leading-[30px] font-bold tabular-nums",
          props.tone === "primary" && "text-primary",
          props.tone === "warning" && "text-warning",
        )}
      >
        {props.value}
      </span>
      <span className="text-[13px] leading-[18px] text-muted-foreground">
        {props.note}
      </span>
    </div>
  );
}

export function ReportTiles({ report }: { report: Report }) {
  const { current, change, losses, fleet } = report;
  const loss = lossPer100(losses.total);
  const rate = utilizationTenths(fleet.siteKgDays, fleet.totalKgDays);
  const tonnes = (kgDays: number) =>
    tonsText(averageKgMilli({ kgDays, days: fleet.days }));
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        label="Doanh thu"
        value={money(current.revenueTotal)}
        note={
          change.text
            ? `${change.text} so với ${change.comparable.label}`
            : "Chưa có số kỳ trước để so"
        }
      />
      <Tile
        label="Lợi nhuận gộp"
        value={money(current.profit)}
        tone="primary"
        note={`Tỷ suất ${marginText(current.profit, current.revenueTotal)}`}
      />
      <Tile
        label="Hao hụt"
        value={loss === null ? "—" : `${hundredthsText(loss)} tấn`}
        tone={loss !== null && loss > 0 ? "warning" : undefined}
        note="trên 100 tấn hàng cho thuê (bãi, xưởng, công trình)"
      />
      <Tile
        label="Tỷ lệ khai thác"
        value={rate === null ? "—" : percentText(rate)}
        note={`${tonnes(fleet.siteKgDays)} / ${tonnes(fleet.totalKgDays)} tấn ở công trình`}
      />
    </div>
  );
}
