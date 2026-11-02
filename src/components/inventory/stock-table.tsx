import Link from "next/link";
import type { ReactNode } from "react";

import { ConditionBadge } from "@/components/domain/condition-badge";
import { CONDITIONS, type Condition } from "@/domain/condition";
import { formatMoney, toMoney } from "@/domain/money";
import { QUANTITY_UNIT_LABELS, hasStandardWeight } from "@/domain/quantity";
import type { SiteStock, StockRow } from "@/lib/inventory/stock";
import { cn } from "@/lib/utils";

import { formatStock } from "./format";
import { stockCardHref } from "./links";
import { SitesMenu } from "./sites-menu";

interface StockTableProps {
  rows: StockRow[];
  sites: Map<string, SiteStock[]>;
  showValue: boolean;
}

const cell = "border-b px-3 py-2.5 text-right tabular-nums";
const head = "px-3 font-semibold";

function Amount({
  milli,
  row,
  href,
  strong = false,
}: {
  milli: number;
  row: StockRow;
  href: string;
  strong?: boolean;
}): ReactNode {
  const text = formatStock(milli, row.unit);
  if (milli === 0) return <span className="text-muted-foreground">{text}</span>;
  return (
    <Link
      href={href}
      className={cn(
        "rounded-sm text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        strong && "font-semibold",
      )}
    >
      {text}
    </Link>
  );
}

/** D10 table: yard by condition, workshop, sites, total, value. */
export function StockTable({ rows, sites, showValue }: StockTableProps) {
  return (
    <div className="relative overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm tabular-nums">
        <thead className="bg-muted">
          <tr>
            <th
              scope="col"
              rowSpan={2}
              className={cn(head, "border-r border-b py-2.5 text-left")}
            >
              Mã hàng
            </th>
            <th
              scope="colgroup"
              colSpan={4}
              className={cn(head, "border-r pt-2 pb-1 text-center")}
            >
              Tại bãi
            </th>
            {["Tại xưởng", "Tại công trình", "Tổng"].map((label) => (
              <th
                key={label}
                scope="col"
                rowSpan={2}
                className={cn(head, "border-b py-2.5 text-right")}
              >
                {label}
              </th>
            ))}
            {showValue ? (
              <th
                scope="col"
                rowSpan={2}
                className={cn(head, "border-b py-2.5 text-right")}
              >
                Giá trị
              </th>
            ) : null}
          </tr>
          <tr>
            {CONDITIONS.map((condition, index) => (
              <th
                key={condition}
                scope="col"
                className={cn(
                  "border-b px-3 pt-1 pb-2.5 text-right",
                  index === CONDITIONS.length - 1 && "border-r",
                )}
              >
                <ConditionBadge condition={condition} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            // Kg items (no standard weight) only ever sit in Scrap.
            const kg = !hasStandardWeight(row.unit);
            const yardCell = (condition: Condition) =>
              kg && condition !== "SCRAP" ? (
                <span className="text-muted-foreground">–</span>
              ) : (
                <Amount
                  milli={row.yard[condition]}
                  row={row}
                  href={stockCardHref(row.code, { condition, place: "yard" })}
                  strong={condition === "GOOD"}
                />
              );
            return (
              <tr key={row.itemId} className="bg-card hover:bg-muted">
                <th
                  scope="row"
                  className="border-r border-b px-3 py-2.5 text-left font-normal"
                >
                  <Link
                    href={stockCardHref(row.code)}
                    className="flex min-w-36 flex-col rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="font-semibold">{row.name}</span>
                    <span className="text-caption font-medium text-muted-foreground">
                      {row.code} · {QUANTITY_UNIT_LABELS[row.unit]}
                    </span>
                  </Link>
                </th>
                {CONDITIONS.map((condition, index) => (
                  <td
                    key={condition}
                    className={cn(
                      cell,
                      index === CONDITIONS.length - 1 && "border-r",
                    )}
                  >
                    {yardCell(condition)}
                  </td>
                ))}
                <td className={cell}>
                  {kg ? (
                    <span className="text-muted-foreground">–</span>
                  ) : (
                    <Amount
                      milli={row.workshop}
                      row={row}
                      href={stockCardHref(row.code, {
                        condition: "all",
                        place: "workshop",
                      })}
                    />
                  )}
                </td>
                <td className={cell}>
                  {kg ? (
                    <span className="text-muted-foreground">–</span>
                  ) : row.sites === 0 ? (
                    <span className="text-muted-foreground">0</span>
                  ) : (
                    <SitesMenu
                      code={row.code}
                      unit={row.unit}
                      total={row.sites}
                      sites={sites.get(row.itemId) ?? []}
                    />
                  )}
                </td>
                <td className={cn(cell, "font-bold")}>
                  {formatStock(row.total, row.unit)}
                </td>
                {showValue ? (
                  <td className={cell}>{formatMoney(toMoney(row.value))}</td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
