// "Tồn kho theo tình trạng" of D1 (spec dashboard): yards and workshops
// together by condition, and what is on site; each item in its own unit.
import Link from "next/link";

import { CONDITIONS, CONDITION_LABELS } from "@/domain/condition";
import { formatQuantity, toQuantity } from "@/domain/quantity";
import type { ConditionRow } from "@/lib/dashboard/stock";

import { Panel } from "./panel";

const cell = "px-3.5 py-2.5 text-right whitespace-nowrap";

export function StockTable({ rows }: { rows: readonly ConditionRow[] }) {
  const qty = (row: ConditionRow, milli: number) =>
    formatQuantity(toQuantity(milli, row.unit));
  return (
    <Panel
      id="stock"
      title="Tồn kho theo tình trạng"
      actions={
        <Link
          href="/inventory"
          className="text-label text-primary hover:underline"
        >
          Xem tồn kho
        </Link>
      }
      note={`Mỗi mã theo đơn vị của mã. Bãi và xưởng gộp; "Ở công trình" là hàng đang cho thuê.`}
    >
      <div className="h-80 overflow-auto rounded-md border">
        <table className="w-full text-label font-normal tabular-nums">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b">
              <th scope="col" className="px-3.5 py-2.5 text-left font-semibold">
                Mã hàng
              </th>
              {CONDITIONS.map((condition) => (
                <th
                  key={condition}
                  scope="col"
                  className={`${cell} font-semibold`}
                >
                  {CONDITION_LABELS[condition]}
                </th>
              ))}
              <th scope="col" className={`${cell} font-semibold`}>
                Ở công trình
              </th>
            </tr>
          </thead>
          <tbody data-mask>
            {rows.map((row) => (
              <tr key={row.itemId} className="border-b last:border-b-0">
                <th scope="row" className="px-3.5 py-2.5 text-left font-medium">
                  {row.name}
                  <span className="block text-caption font-normal text-muted-foreground">
                    {row.code}
                  </span>
                </th>
                {CONDITIONS.map((condition) => (
                  <td key={condition} className={cell}>
                    {qty(row, row.stock[condition])}
                  </td>
                ))}
                <td className={cell}>{qty(row, row.onSite)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
