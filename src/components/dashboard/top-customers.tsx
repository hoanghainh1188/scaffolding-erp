"use client";

// "Top 5 nhà thầu năm nay" of D1 (0.2 #93, #95): by revenue or by kg
// delivered this year; every row shows both.
import { useState } from "react";

import type { TopRow } from "@/lib/dashboard/top";
import { cn } from "@/lib/utils";

import { money, tons } from "./format";
import { Panel, Segmented } from "./panel";

type By = "revenue" | "kg";

export function TopCustomers({
  year,
  byRevenue,
  byKg,
}: {
  year: string;
  byRevenue: readonly TopRow[];
  byKg: readonly TopRow[];
}) {
  const [by, setBy] = useState<By>("revenue");
  const rows = by === "revenue" ? byRevenue : byKg;
  return (
    <Panel
      id="top"
      title={`Top 5 nhà thầu năm ${year}`}
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
      note={
        by === "revenue"
          ? "Doanh thu = thuê + bán từ 01/01, chưa gồm VAT."
          : "Kg hàng đã giao từ 01/01 (thuê và bán), không trừ hàng trả."
      }
    >
      {rows.length === 0 ? (
        <p className="h-72 text-body text-muted-foreground">
          Chưa có số năm nay.
        </p>
      ) : (
        <ol
          aria-label="Xếp hạng nhà thầu"
          tabIndex={0}
          className="h-72 overflow-y-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          data-mask
        >
          {rows.map((row, index) => (
            <li
              key={row.customerId}
              className="flex items-center gap-3 border-b py-2.5 last:border-b-0"
            >
              <span
                className={cn(
                  "inline-flex size-[26px] flex-none items-center justify-center rounded-pill text-[13px] font-bold",
                  index === 0
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground",
                )}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-label font-normal">
                {row.name}
              </span>
              <span className="flex flex-col items-end tabular-nums">
                <strong className="text-label">
                  {by === "revenue" ? money(row.revenue) : tons(row.kgMilli)}
                </strong>
                <span className="text-caption font-normal text-muted-foreground">
                  {by === "revenue" ? tons(row.kgMilli) : money(row.revenue)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
