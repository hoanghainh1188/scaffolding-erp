// "Các khoản nợ" of the chosen customer on D14 (receivables spec "Các khoản
// của một nhà thầu"): fixed order, settled ones hidden by default, each
// document opens its own screen.
import Link from "next/link";

import { ToneBadge } from "@/components/domain/tone-badge";
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
import { DEBT_KIND_LABELS, orderDebts } from "@/domain/receivables";
import type { DebtView } from "@/lib/receivables/balances";

import { dayMonth, DEBT_TONES, money } from "./format";

export function debtHref(debt: DebtView): string {
  switch (debt.kind) {
    case "BILLING":
      return `/receivables/billing?month=${debt.documentCode}&contract=${debt.contractId}`;
    case "SALE":
      return `/sales/deliveries/${encodeURIComponent(debt.documentCode)}`;
    case "COMPENSATION":
      return `/sales/compensations/${encodeURIComponent(debt.documentCode)}`;
    default:
      return `/sales/buy-backs/${encodeURIComponent(debt.documentCode)}`;
  }
}

function content(debt: DebtView): string {
  const where = debt.siteName ? ` · ${debt.siteName}` : "";
  switch (debt.kind) {
    case "BILLING":
      return `${debt.freight > 0 ? "Tiền thuê + cước" : "Tiền thuê"}${where}`;
    case "SALE":
      return `${debt.freight > 0 ? "Hàng bán + cước" : "Hàng bán"}${where}`;
    case "COMPENSATION":
      return `Đền bù hàng hỏng, mất${where}`;
    default:
      return `Mua lại hàng ở công trình${where}`;
  }
}

interface DebtTableProps {
  customerName: string;
  debts: readonly DebtView[];
  owed: number;
  showPaid: boolean;
  /** Link that flips "Ẩn khoản đã thu đủ". */
  togglePaidHref: string;
}

export function DebtTable(props: DebtTableProps) {
  const rows = orderDebts(
    props.showPaid
      ? props.debts
      : props.debts.filter((debt) => debt.remaining > 0),
  );
  return (
    <section aria-labelledby="debts-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="debts-title" className="text-h2">
          Các khoản nợ · {props.customerName}
        </h2>
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
          Ẩn khoản đã thu đủ
        </Link>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Chứng từ</TableHead>
              <TableHead>Nội dung</TableHead>
              <TableHead className="text-right">Phát sinh</TableHead>
              <TableHead className="text-right">Đã trừ</TableHead>
              <TableHead className="text-right">Còn lại</TableHead>
              <TableHead>Hạn</TableHead>
              <TableHead>Tình hình</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  Không còn khoản nào đang nợ.
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((debt) => (
              <TableRow key={debt.key}>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <Link
                        href={debtHref(debt)}
                        className="font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {debt.label}
                      </Link>
                      <ToneBadge tone="neutral">
                        {DEBT_KIND_LABELS[debt.kind]}
                      </ToneBadge>
                    </span>
                    <span className="text-caption text-muted-foreground">
                      {dayMonth(debt.issuedDate)} · {debt.contractCode}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{content(debt)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <div className="flex flex-col">
                    <span>{money(debt.total)}</span>
                    <span className="text-caption text-muted-foreground">
                      {debt.vatApplies
                        ? `gồm VAT ${money(debt.vat)}`
                        : "không VAT"}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(debt.paid)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {money(debt.remaining)}
                </TableCell>
                <TableCell title={formatBusinessDate(debt.dueDate)}>
                  {dayMonth(debt.dueDate)}
                </TableCell>
                <TableCell>
                  <ToneBadge tone={DEBT_TONES[debt.status.kind]} data-mask>
                    {debt.status.label}
                  </ToneBadge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4}>{props.customerName} đang nợ</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {money(props.owed)}
              </TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      <p className="text-caption text-muted-foreground">
        Hạn = ngày chốt kỳ / ngày giao hàng bán / ngày duyệt đền bù, mua lại +
        số ngày được nợ. Kỳ chưa chốt chưa vào sổ.
      </p>
    </section>
  );
}
