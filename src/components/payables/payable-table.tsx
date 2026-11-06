// "Các khoản phải trả" of the chosen seller on D14c (payables spec "Các
// khoản của một người bán"): fixed order, paid ones hidden by default; the
// receipt and its order open their own screens.
import Link from "next/link";

import { ToneBadge } from "@/components/domain/tone-badge";
import { dayMonth, DEBT_TONES, money } from "@/components/receivables/format";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBusinessDate } from "@/domain/business-date";
import type { PayableView } from "@/lib/payables/balances";

interface PayableTableProps {
  supplierName: string;
  heading: string;
  payables: readonly PayableView[];
  owed: number;
  showPaid: boolean;
  /** Link that flips "Ẩn khoản đã trả đủ". */
  togglePaidHref: string;
}

export function PayableTable(props: PayableTableProps) {
  return (
    <section aria-labelledby="payables-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="payables-title" className="text-h2">
            Các khoản phải trả · {props.supplierName}
          </h2>
          <p className="text-caption text-muted-foreground">{props.heading}</p>
        </div>
        <Link
          href={props.togglePaidHref}
          role="checkbox"
          aria-checked={!props.showPaid}
          className="flex items-center gap-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span
            aria-hidden
            className="grid size-4 place-items-center rounded-xs border bg-card text-primary"
          >
            {props.showPaid ? "" : "✓"}
          </span>
          Ẩn khoản đã trả đủ
        </Link>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Phiếu nhập</TableHead>
              <TableHead>Hàng</TableHead>
              <TableHead className="text-right">Tiền hàng</TableHead>
              <TableHead className="text-right">Đã trả</TableHead>
              <TableHead className="text-right">Còn lại</TableHead>
              <TableHead>Hạn</TableHead>
              <TableHead>Tình hình</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.payables.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  Không còn khoản nào phải trả.
                </TableCell>
              </TableRow>
            ) : null}
            {props.payables.map((row) => (
              <TableRow key={row.key}>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <Link
                      href={`/m/receipts/${encodeURIComponent(row.code)}`}
                      className="font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {row.code}
                    </Link>
                    <span className="text-caption text-muted-foreground">
                      Nhập {dayMonth(row.issuedDate)} ·{" "}
                      <Link
                        href={`/purchasing/orders/${encodeURIComponent(row.orderCode)}`}
                        className="hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {row.orderCode}
                      </Link>{" "}
                      · chuyến {row.tripNo}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="max-w-72 min-w-48 text-sm whitespace-normal">
                  {row.goods}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(row.total)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(row.paid)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {money(row.remaining)}
                </TableCell>
                <TableCell title={formatBusinessDate(row.dueDate)}>
                  {dayMonth(row.dueDate)}
                </TableCell>
                <TableCell>
                  <ToneBadge tone={DEBT_TONES[row.status.kind]} data-mask>
                    {row.status.label}
                  </ToneBadge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4}>
                Còn phải trả {props.supplierName}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {money(props.owed)}
              </TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </section>
  );
}
