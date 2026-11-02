import Link from "next/link";

import { formatBusinessDate } from "@/domain/business-date";
import { formatMoney, toMoney } from "@/domain/money";
import type { ContractListRow } from "@/lib/contracts/list";

import { ContractStatusBadge, ContractTypeBadge } from "./contract-badges";

const head = "border-b px-3 py-2.5 font-semibold";
const cell = "border-b px-3 py-2.5 align-top";

function period(row: ContractListRow): string {
  if (!row.startDate) return "–";
  if (row.type === "SALE") return `Giao ${formatBusinessDate(row.startDate)}`;
  return row.endDate
    ? `${formatBusinessDate(row.startDate)} – ${formatBusinessDate(row.endDate)}`
    : `Từ ${formatBusinessDate(row.startDate)}`;
}

/** D4 table: one contract a row, the number opens D5. */
export function ContractTable({ rows }: { rows: ContractListRow[] }) {
  return (
    <div className="relative overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted text-left">
          <tr>
            <th scope="col" className={head}>
              Số hợp đồng
            </th>
            <th scope="col" className={head}>
              Nhà thầu · công trình
            </th>
            <th scope="col" className={head}>
              Thời gian
            </th>
            <th scope="col" className={`${head} text-right`}>
              Giá trị
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
                <span className="flex flex-col items-start gap-1">
                  <Link
                    href={`/sales/contracts/${row.id}`}
                    className="rounded-sm font-semibold whitespace-nowrap text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {row.code}
                  </Link>
                  <ContractTypeBadge type={row.type} />
                </span>
              </th>
              <td className={cell}>
                <span className="flex flex-col">
                  <span className="font-medium">{row.customerName}</span>
                  <span className="text-caption text-muted-foreground">
                    {row.siteName ?? "Nhận hàng tại bãi"}
                  </span>
                </span>
              </td>
              <td className={`${cell} whitespace-nowrap tabular-nums`}>
                {period(row)}
              </td>
              <td
                className={`${cell} text-right font-semibold whitespace-nowrap tabular-nums`}
              >
                {row.value === null ? "–" : formatMoney(toMoney(row.value))}
              </td>
              <td className={cell}>
                <span className="flex flex-col items-start gap-1">
                  <ContractStatusBadge status={row.status} />
                  {row.warnings.map((warning) => (
                    <span key={warning} className="text-caption text-warning">
                      {warning}
                    </span>
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
