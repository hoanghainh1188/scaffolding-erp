"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormError } from "@/components/catalog/form-error";
import { amountText, moneyText } from "@/components/deliveries/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBusinessDate, type BusinessDate } from "@/domain/business-date";
import {
  BUY_BACK_STATUS_LABELS,
  buyBackLineAmount,
  buyBackTotal,
} from "@/domain/buy-back";
import { callApi } from "@/lib/api-client";
import type { BuyBackView as View } from "@/lib/buy-backs/queries";

export interface BuyBackViewProps {
  view: View;
  canApprove: boolean;
  createdAtText: string;
  today: BusinessDate;
  /** ₫ a day the site loses when approved. */
  dailyDrop: number;
  overdue: { amount: number; days: number };
}

/** D6c read-only, with the director's bar while pending (spec buy-backs). */
export function BuyBackView({
  view,
  canApprove,
  createdAtText,
  today,
  dailyDrop,
  overdue,
}: BuyBackViewProps) {
  const router = useRouter();
  const [approvalReason, setApprovalReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = view.amountDue ?? buyBackTotal(view.lines);
  const pending = view.status === "PENDING";

  async function decide(path: "approve" | "reject", reason: string) {
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/buy-backs/${view.id}/${path}`, {
      method: "POST",
      body: { updatedAt: view.updatedAt, reason: reason || null },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRejecting(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {canApprove && pending ? (
        <section
          aria-labelledby="buy-back-approval"
          className="flex flex-col gap-3 rounded-lg border-2 border-warning bg-card p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="buy-back-approval" className="text-h2">
                Phiếu mua lại đang chờ bạn duyệt
              </h2>
              <p className="text-sm text-muted-foreground">
                {view.createdByName} gửi lúc{" "}
                {/* The masked time has a fixed width and ends its line, so
                    neither the mask nor the words move in screenshots. */}
                <span data-clock className="inline-block w-[15ch]">
                  {createdAtText}.
                </span>
                <span className="block">
                  Duyệt xong mới ghi sổ, thôi tính thuê và tính tiền bán.
                </span>
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setRejecting(true)}
                >
                  Từ chối
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void decide("approve", approvalReason)}
                >
                  {busy ? "Đang duyệt…" : `Duyệt ${moneyText(total)}`}
                </Button>
              </div>
              <span className="text-caption text-muted-foreground">
                Tính thuê tới khi duyệt: duyệt hôm nay thì tính đến hết{" "}
                <span data-clock className="inline-block w-[10ch]">
                  {formatBusinessDate(today)}
                </span>
              </span>
            </div>
          </div>
          {overdue.amount > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="buy-back-approval-reason">
                Lý do vẫn duyệt · bắt buộc vì nhà thầu đang nợ quá hạn{" "}
                {moneyText(overdue.amount)} ({overdue.days} ngày)
              </Label>
              <textarea
                id="buy-back-approval-reason"
                value={approvalReason}
                maxLength={500}
                onChange={(event) => setApprovalReason(event.target.value)}
                className="min-h-16 rounded-md border border-input bg-card px-3 py-2 text-base"
              />
            </div>
          ) : null}
          <FormError message={rejecting ? null : error} />
        </section>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-labelledby="buy-back-source"
            className="grid gap-x-6 gap-y-2 rounded-lg border bg-card p-5 md:grid-cols-2"
          >
            <h2 id="buy-back-source" className="text-h2 md:col-span-2">
              Nguồn
            </h2>
            <p className="text-sm">
              <span className="text-muted-foreground">Nhà thầu </span>
              {view.customerName}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Công trình </span>
              {view.siteName}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Hợp đồng thuê </span>
              {view.contractCode}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Lý do </span>
              {view.reason}
            </p>
          </section>
          <section
            aria-labelledby="buy-back-goods"
            className="flex flex-col gap-3 rounded-lg border bg-card p-5"
          >
            <h2 id="buy-back-goods" className="text-h2">
              Hàng khách mua
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hàng</TableHead>
                  <TableHead className="text-right">Số mua</TableHead>
                  <TableHead className="text-right">Đơn giá</TableHead>
                  <TableHead className="text-right">Thành tiền</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.lines.map((line) => (
                  <TableRow key={line.itemId}>
                    <TableCell>
                      <span className="font-medium">{line.itemName}</span>{" "}
                      <span className="text-caption text-muted-foreground">
                        {line.itemCode}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {amountText(line.milli, line.unit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {moneyText(line.unitPrice)}
                      <span className="block text-caption text-muted-foreground">
                        {line.contractPrice === line.unitPrice
                          ? "giá mất trên hợp đồng"
                          : line.contractPrice === null
                            ? "hợp đồng chưa có giá mất"
                            : `khác giá hợp đồng (${moneyText(line.contractPrice)})`}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {moneyText(buyBackLineAmount(line))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Cộng</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {moneyText(total)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </section>
        </div>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          <section
            aria-labelledby="buy-back-money"
            className="flex flex-col gap-2 rounded-lg border bg-card p-5"
          >
            <h2
              id="buy-back-money"
              className="text-label text-muted-foreground"
            >
              Tiền bán · {BUY_BACK_STATUS_LABELS[view.status]}
            </h2>
            <p className="text-h1 tabular-nums">{moneyText(total)}</p>
            {view.dueDate ? (
              <p className="text-sm text-muted-foreground">
                Duyệt {formatBusinessDate(view.approvedDate ?? "")} · hạn trả{" "}
                {formatBusinessDate(view.dueDate)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Cộng vào công nợ khi duyệt · hạn theo hợp đồng
              </p>
            )}
            {view.rejectedReason ? (
              <p className="text-sm">Lý do từ chối: {view.rejectedReason}</p>
            ) : null}
          </section>
          {pending ? (
            <section
              aria-labelledby="buy-back-when"
              className="flex flex-col gap-2 rounded-lg border bg-card p-5"
            >
              <h2 id="buy-back-when" className="text-h3">
                Khi duyệt
              </h2>
              <ul className="flex flex-col gap-1 text-sm">
                <li>
                  Sổ kho: ra{" "}
                  {view.lines
                    .map((line) => `${line.milli / 1000} ${line.itemCode}`)
                    .join(", ")}{" "}
                  ở công trình
                </li>
                <li>Thôi tính thuê từ ngày duyệt: tính đến hết ngày đó.</li>
                <li>
                  Tiền thuê 1 ngày ở {view.siteName} giảm{" "}
                  {moneyText(-dailyDrop)}
                </li>
              </ul>
              <p className="text-caption text-muted-foreground">
                Nhà thầu đang nợ quá hạn thì phải ghi lý do khi duyệt, như duyệt
                hợp đồng.
              </p>
            </section>
          ) : null}
        </aside>
      </div>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối phiếu mua lại</DialogTitle>
            <DialogDescription>
              Hàng vẫn ở công trình và vẫn tính thuê.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="buy-back-reject-reason">Lý do từ chối</Label>
            <textarea
              id="buy-back-reject-reason"
              value={rejectReason}
              maxLength={500}
              onChange={(event) => setRejectReason(event.target.value)}
              className="min-h-16 rounded-md border border-input bg-card px-3 py-2 text-base"
            />
          </div>
          <FormError message={error} />
          <DialogFooter>
            <Button
              disabled={busy}
              onClick={() => void decide("reject", rejectReason)}
            >
              Từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
