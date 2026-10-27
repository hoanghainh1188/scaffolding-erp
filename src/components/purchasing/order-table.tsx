import Link from "next/link";

import { formatBusinessDate } from "@/domain/business-date";
import { formatMoney } from "@/domain/money";
import type { OrderListRow } from "@/lib/purchasing/queries";

import { OrderKindBadge, OrderStatusBadge } from "./order-status-badge";

const head = "border-b px-3 py-2.5 font-semibold";
const cell = "border-b px-3 py-2.5";

/** D2 table: one order a row, the code opens D3b. */
export function OrderTable({ rows }: { rows: OrderListRow[] }) {
  return (
    <div className="relative overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted text-left">
          <tr>
            <th scope="col" className={head}>
              Số đơn
            </th>
            <th scope="col" className={head}>
              Nhà cung cấp / cai thầu
            </th>
            <th scope="col" className={head}>
              Loại
            </th>
            <th scope="col" className={head}>
              Ngày nhập
            </th>
            <th scope="col" className={`${head} text-right`}>
              Số mã
            </th>
            <th scope="col" className={`${head} text-right`}>
              Tổng cộng
            </th>
            <th scope="col" className={head}>
              Trạng thái
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="bg-card hover:bg-muted">
              <th scope="row" className={`${cell} text-left`}>
                <Link
                  href={`/purchasing/orders/${row.code}`}
                  className="rounded-sm font-semibold whitespace-nowrap text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {row.code}
                </Link>
              </th>
              <td className={cell}>{row.supplierName}</td>
              <td className={cell}>
                <OrderKindBadge kind={row.kind} />
              </td>
              <td className={`${cell} whitespace-nowrap tabular-nums`}>
                {row.expectedDate
                  ? `${formatBusinessDate(row.expectedDate)}${row.expectedTime ? ` · ${row.expectedTime}` : ""}`
                  : "–"}
              </td>
              <td className={`${cell} text-right tabular-nums`}>
                {row.lineCount}
              </td>
              <td
                className={`${cell} text-right font-semibold whitespace-nowrap tabular-nums`}
              >
                {formatMoney(row.total)}
              </td>
              <td className={cell}>
                <OrderStatusBadge
                  status={row.status}
                  outcome={row.outcome}
                  hasReceipts={row.hasReceipts}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
