// D15 Báo cáo quản trị (spec management-reports, gross-profit,
// fleet-metrics; design D9–D11): read only, recomputed on every visit.
import type { Metadata } from "next";
import { connection } from "next/server";

import { CustomerRanking } from "@/components/reports/customer-ranking";
import { LossTable, UseTable } from "@/components/reports/fleet-tables";
import {
  PeriodPicker,
  type PeriodOption,
} from "@/components/reports/period-picker";
import { chartMonths, ProfitChart } from "@/components/reports/profit-chart";
import { ProfitTable } from "@/components/reports/profit-table";
import { ReportTiles } from "@/components/reports/report-tiles";
import { getDatabase } from "@/db/client";
import { toBusinessDate } from "@/domain/business-date";
import {
  parsePeriod,
  periodLabel,
  periodOptions,
  switchKind,
  PERIOD_KINDS,
  type PeriodKind,
} from "@/domain/report-period";
import { requirePermission } from "@/lib/auth/guard";
import { buildReport } from "@/lib/reports/report";

export const metadata: Metadata = { title: "Báo cáo quản trị" };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("reports.view");
  await connection();
  const params = await searchParams;
  const today = toBusinessDate(new Date());
  const period = parsePeriod(first(params.period), first(params.value), today);
  const report = await buildReport(getDatabase(), period, today);
  const options: PeriodOption[] = periodOptions(period.kind, today).map(
    (option) => ({ value: option.value, label: periodLabel(option) }),
  );
  const switchTo = Object.fromEntries(
    PERIOD_KINDS.map((kind) => [kind, switchKind(period, kind).value]),
  ) as Record<PeriodKind, string>;

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-1.5">
          <h1 className="font-display text-h1">Báo cáo quản trị</h1>
          <p className="text-body text-muted-foreground">
            {report.label} · {report.dataUntil}. Tiền thuê kỳ đã chốt lấy bảng
            chụp; kỳ chưa chốt tạm tính. Mọi số tính từ sổ kho và chứng từ, chưa
            VAT.
          </p>
        </div>
        <PeriodPicker
          kind={period.kind}
          value={period.value}
          options={options}
          switchTo={switchTo}
        />
      </div>

      <ReportTiles report={report} />

      <ProfitTable report={report} />
      <ProfitChart year={report.year} months={chartMonths(report.months)} />
      <LossTable report={report} />
      <UseTable report={report} />

      <CustomerRanking
        year={report.year}
        byRevenue={report.ranking.byRevenue}
        byKg={report.ranking.byKg}
      />
    </div>
  );
}
