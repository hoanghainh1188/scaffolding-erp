"use client";

// "Xếp hạng nhà thầu năm …" of D15 (spec management-reports; 0.2 số 93, số 95,
// số 110, số 115): every customer of the year, by revenue or by kg delivered,
// in a scrolling table; the first five are D1's top 5.
import { useState } from "react";

import { money, tons } from "@/components/dashboard/format";
import { Panel, Segmented } from "@/components/dashboard/panel";
import type { RankingRow } from "@/lib/reports/ranking";
import { cn } from "@/lib/utils";

type By = "revenue" | "kg";

const NUMBER = "px-3.5 py-2.5 text-right whitespace-nowrap tabular-nums";
const HEAD = "px-3.5 py-2.5 text-right font-semibold";

export function CustomerRanking({
  year,
  byRevenue,
  byKg,
}: {
  year: number;
  byRevenue: readonly RankingRow[];
  byKg: readonly RankingRow[];
}) {
  const [by, setBy] = useState<By>("revenue");
  const rows = by === "revenue" ? byRevenue : byKg;
  return (
    <Panel
      id="rank"
      title={`Xếp hạng nhà thầu năm ${year}`}
      actions={
        <Segmented
          label="Xếp hạng theo"
          value={by}
          onChange={setBy}
          options={[
            { value: "revenue", label: "Doanh thu" },
            { value: "kg", label: "Theo kg" },
          ]}
        />
      }
      note="Doanh thu = thuê + bán, chưa VAT (như Tổng quan). Tấn đã giao = hàng thuê và bán theo phiếu xuất trong năm, không trừ hàng trả."
    >
      {rows.length === 0 ? (
        <p className="text-body text-muted-foreground">
          Chưa có nhà thầu nào trong năm {year}.
        </p>
      ) : (
        <div
          tabIndex={0}
          aria-label="Bảng xếp hạng nhà thầu"
          className="max-h-[520px] overflow-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <table className="w-full min-w-[720px] border-collapse text-label font-normal">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-caption text-muted-foreground">
                <th
                  scope="col"
                  className="px-3.5 py-2.5 text-left font-semibold"
                >
                  Nhà thầu
                </th>
                <th scope="col" className={HEAD}>
                  Doanh thu
                </th>
                <th scope="col" className={HEAD}>
                  Thuê
                </th>
                <th scope="col" className={HEAD}>
                  Bán
                </th>
                <th scope="col" className={HEAD}>
                  Tấn đã giao
                </th>
                <th scope="col" className={HEAD}>
                  Hợp đồng
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.customerId} className="border-b last:border-b-0">
                  <th
                    scope="row"
                    className="px-3.5 py-2.5 text-left font-medium"
                  >
                    <span
                      className={cn(
                        "mr-2.5 inline-flex size-[26px] items-center justify-center rounded-pill text-[13px] font-bold",
                        row.rank === 1
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground",
                      )}
                    >
                      {row.rank}
                    </span>
                    {row.name}
                  </th>
                  <td
                    className={cn(NUMBER, by === "revenue" && "font-semibold")}
                  >
                    {money(row.revenue)}
                  </td>
                  <td className={NUMBER}>{money(row.rent)}</td>
                  <td className={NUMBER}>{money(row.sale)}</td>
                  <td className={cn(NUMBER, by === "kg" && "font-semibold")}>
                    {tons(row.kgMilli).replace(" tấn", "")}
                  </td>
                  <td className={NUMBER}>{row.contracts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
