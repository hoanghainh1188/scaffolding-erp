// "Phiếu thu" of the chosen customer on D14 (customer-receipts spec "Danh
// sách phiếu thu của nhà thầu"): newest first, what each settled, cancelled
// ones with their reason.
import { ToneBadge } from "@/components/domain/tone-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBusinessDate } from "@/domain/business-date";
import { PAYMENT_METHOD_LABELS } from "@/domain/receivables";
import type { receiptsWithAllocations } from "@/lib/receivables/receipts";
import { cn } from "@/lib/utils";

import { CancelReceipt } from "./cancel-receipt";
import { money } from "./format";

interface ReceiptTableProps {
  customerName: string;
  rows: ReturnType<typeof receiptsWithAllocations>;
  canCancel: boolean;
}

export function ReceiptTable(props: ReceiptTableProps) {
  return (
    <section
      aria-labelledby="receipts-title"
      className="flex flex-col gap-3 rounded-lg border bg-card p-5"
    >
      <h2 id="receipts-title" className="text-h2">
        Phiếu thu · {props.customerName}
      </h2>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Phiếu thu</TableHead>
              <TableHead className="text-right">Số tiền</TableHead>
              <TableHead>Đã trừ vào</TableHead>
              <TableHead className="w-24">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Chưa có phiếu thu nào.
                </TableCell>
              </TableRow>
            ) : null}
            {props.rows.map(({ receipt, settled, prepaid }) => {
              const cancelled = receipt.cancelled;
              return (
                <TableRow key={receipt.id}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span
                        className={cn(
                          "font-medium",
                          cancelled && "text-muted-foreground line-through",
                        )}
                      >
                        {receipt.code}
                      </span>
                      <span className="text-caption text-muted-foreground">
                        {formatBusinessDate(receipt.receivedDate)} ·{" "}
                        {PAYMENT_METHOD_LABELS[receipt.method]} ·{" "}
                        {receipt.createdByName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(receipt.amount)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {cancelled ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <ToneBadge tone="destructive">Đã hủy</ToneBadge>
                        <span className="text-muted-foreground">
                          {cancelled.reason} · {cancelled.byName}
                        </span>
                      </span>
                    ) : receipt.kind === "DEPOSIT" ? (
                      <span>Cọc tiền {receipt.contractCode} · giữ riêng</span>
                    ) : (
                      <span>
                        {[
                          ...settled.map(
                            (entry) => `${entry.label} ${money(entry.amount)}`,
                          ),
                          ...(prepaid > 0
                            ? [`Trả trước ${money(prepaid)}`]
                            : []),
                        ].join(" · ")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {props.canCancel && !cancelled ? (
                      <CancelReceipt
                        id={receipt.id}
                        code={receipt.code}
                        amountText={money(receipt.amount)}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-caption text-muted-foreground">
        Phiếu thu không sửa. Ghi sai thì Kế toán hủy và ghi lý do: các khoản đã
        trừ mở lại, rồi lập phiếu mới.
      </p>
    </section>
  );
}
