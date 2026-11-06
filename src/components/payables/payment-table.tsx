// "Phiếu chi" of the chosen seller on D14c (supplier-payments spec "Danh
// sách phiếu chi"): newest first, what each one paid, Hủy for managers.
import Link from "next/link";

import { ToneBadge } from "@/components/domain/tone-badge";
import { dayMonth, money } from "@/components/receivables/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toBusinessDate } from "@/domain/business-date";
import { PAYMENT_METHOD_LABELS } from "@/domain/receivables";
import type { PaymentView } from "@/lib/payables/queries";
import { cn } from "@/lib/utils";

import { CancelPayment } from "./cancel-payment";

/** "PN-2026-087 38.000.000 ₫ · Ứng trước 2.250.000 ₫" */
export function paidInto(payment: PaymentView): string {
  if (payment.kind === "ADVANCE") {
    const used = payment.parts.map(
      (part) =>
        `đã tự trừ vào ${part.receiptCode} ngày ${dayMonth(toBusinessDate(part.at))}`,
    );
    const left =
      payment.advanceLeft > 0 ? [`còn giữ ${money(payment.advanceLeft)}`] : [];
    return ["Ứng trước", ...used, ...left].join(" · ");
  }
  const parts = payment.parts.map(
    (part) => `${part.receiptCode} ${money(part.amount)}`,
  );
  if (payment.advanceLeft > 0) {
    parts.push(`Ứng trước ${money(payment.advanceLeft)}`);
  }
  return parts.join(" · ");
}

interface PaymentTableProps {
  supplierName: string;
  rows: readonly PaymentView[];
  canCancel: boolean;
  moreHref: string | null;
}

export function PaymentTable(props: PaymentTableProps) {
  return (
    <section
      aria-labelledby="payments-title"
      className="flex flex-col gap-3 rounded-lg border bg-card p-5"
    >
      <h2 id="payments-title" className="text-h2">
        Phiếu chi · {props.supplierName}
      </h2>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Phiếu chi</TableHead>
              <TableHead className="text-right">Số tiền</TableHead>
              <TableHead>Đã trừ vào</TableHead>
              <TableHead className="w-24">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Chưa có phiếu chi nào.
                </TableCell>
              </TableRow>
            ) : null}
            {props.rows.map((payment) => {
              const cancelled = payment.cancelled;
              return (
                <TableRow key={payment.id}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span
                        className={cn(
                          "font-medium",
                          cancelled && "text-muted-foreground line-through",
                        )}
                      >
                        {payment.code}
                      </span>
                      <span className="text-caption text-muted-foreground">
                        {dayMonth(payment.paidDate)} ·{" "}
                        {PAYMENT_METHOD_LABELS[payment.method]} ·{" "}
                        {payment.createdByName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(payment.amount)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {cancelled ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <ToneBadge tone="destructive">Đã hủy</ToneBadge>
                        <span className="text-muted-foreground">
                          {cancelled.reason} · {cancelled.byName}
                        </span>
                      </span>
                    ) : (
                      <span>{paidInto(payment)}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {props.canCancel && !cancelled ? (
                      <CancelPayment
                        id={payment.id}
                        code={payment.code}
                        amountText={money(payment.amount)}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {props.moreHref ? (
        <Link
          href={props.moreHref}
          className="text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Xem thêm
        </Link>
      ) : null}
      <p className="text-caption text-muted-foreground">
        Phiếu chi không sửa. Ghi sai thì Kế toán hủy và ghi lý do: khoản đã trừ
        mở lại, rồi lập phiếu mới.
      </p>
    </section>
  );
}
