"use client";

// "Doanh số" of D1 (spec dashboard "Khối doanh số", sales-revenue): six
// months or the days of this month, rent and sale stacked, before VAT;
// compensation and buy-back shown apart.
import { useState } from "react";

import { formatBusinessDate } from "@/domain/business-date";
import {
  millionsText,
  type DayRevenue,
  type MonthRevenue,
} from "@/domain/dashboard";

import { money, monthShort } from "./format";
import { Panel, Segmented } from "./panel";
import { RevenueChart, type ChartBar } from "./revenue-chart";

type Mode = "month" | "day";

export interface RevenuePanelProps {
  months: readonly MonthRevenue[];
  days: readonly DayRevenue[];
  today: DayRevenue;
  separate: number;
}

export function RevenuePanel({
  months,
  days,
  today,
  separate,
}: RevenuePanelProps) {
  const [mode, setMode] = useState<Mode>("month");
  const current = months.at(-1)?.month ?? today.date.slice(0, 7);
  const bars: ChartBar[] =
    mode === "month"
      ? months.map((month) => ({
          key: month.month,
          label: `${monthShort(month.month)}${month.provisional ? "*" : ""}`,
          rent: month.rent,
          sale: month.sale,
          valueText: millionsText(month.total),
          provisional: month.provisional,
          current: month.month === current,
        }))
      : days.map((day) => ({
          key: day.date,
          label: String(Number(day.date.slice(8, 10))),
          rent: day.rent,
          sale: day.sale,
          provisional: true,
          current: day.date === today.date,
        }));
  return (
    <Panel
      id="revenue"
      title="Doanh số"
      actions={
        <Segmented
          label="Xem doanh số"
          value={mode}
          onChange={setMode}
          options={[
            { value: "month", label: "Theo tháng" },
            { value: "day", label: "Theo ngày" },
          ]}
        />
      }
      note="Thuê: tiền thuê từng ngày tính từ sổ kho (đã trừ ngày nghỉ), gồm cước hợp đồng thuê. Bán: hàng bán và cước theo ngày giao. Chưa gồm VAT."
    >
      <RevenueChart
        bars={bars}
        label={
          mode === "month"
            ? "Doanh số 6 tháng"
            : `Doanh số từng ngày ${monthShort(current)}`
        }
      />
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-[3px] bg-primary" />
          Thuê
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-[3px] bg-highlight" />
          Bán
        </span>
        <span data-mask>
          * {monthShort(current)} đến{" "}
          {formatBusinessDate(today.date).slice(0, 5)}, tiền thuê tạm tính (kỳ
          chưa chốt)
        </span>
      </div>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-4 gap-y-2 pt-1 text-label font-normal tabular-nums">
        <div>
          <dt className="text-caption font-semibold text-muted-foreground">
            Hôm nay · thuê
          </dt>
          <dd className="font-bold" data-mask>
            {money(today.rent)}
          </dd>
        </div>
        <div>
          <dt className="text-caption font-semibold text-muted-foreground">
            Hôm nay · bán
          </dt>
          <dd className="font-bold" data-mask>
            {money(today.sale)}
          </dd>
        </div>
        <div>
          <dt className="text-caption font-semibold text-muted-foreground">
            Đền bù, mua lại {monthShort(current)}
          </dt>
          <dd className="font-bold" data-mask>
            {money(separate)}
          </dd>
          <dd className="text-caption font-normal text-muted-foreground">
            tính riêng, không cộng vào doanh số
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
