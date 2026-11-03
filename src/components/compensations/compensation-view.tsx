"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

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
import { Input } from "@/components/ui/input";
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
import { formatBusinessDate } from "@/domain/business-date";
import {
  COMPENSATION_KIND_LABELS,
  COMPENSATION_PRICE_NOTES,
  compensationLineAmount,
  compensationTotal,
  summaryByKind,
  type CompensationKind,
  type CompensationStatus,
} from "@/domain/compensation";
import { DomainValueError } from "@/domain/errors";
import { formatByUnit, type QuantityUnit } from "@/domain/quantity";
import { parseMoney } from "@/domain/money";
import { callApi } from "@/lib/api-client";

export interface CompensationViewLine {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: QuantityUnit;
  kind: CompensationKind;
  quantityMilli: number;
  unitPrice: number | null;
  contractPrice: number | null;
}

export interface CompensationViewProps {
  id: string;
  status: CompensationStatus;
  updatedAt: string;
  createdAtText: string;
  contractCode: string;
  returnCode: string;
  returnDate: string;
  lines: CompensationViewLine[];
  discountAmount: number;
  discountReason: string | null;
  approvalReason: string | null;
  rejectedReason: string | null;
  amountDue: number | null;
  approvedByName: string | null;
  approvedDate: string | null;
  dueDate: string | null;
  paymentTermsDays: number;
  overdue: { amount: number; days: number };
  canApprove: boolean;
}

const lineKey = (line: Pick<CompensationViewLine, "itemId" | "kind">) =>
  `${line.itemId}|${line.kind}`;

/** "1.250.000" typed into a price box, or null while it is not a number. */
function readMoney(text: string): number | null {
  if (text.trim() === "") return null;
  try {
    return parseMoney(text);
  } catch (error: unknown) {
    if (error instanceof DomainValueError) return null;
    throw error;
  }
}

/** D8 (compensations spec "Màn D8 Phiếu đền bù"). */
export function CompensationView(props: CompensationViewProps) {
  const router = useRouter();
  const editable = props.canApprove && props.status === "PENDING";
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [discount, setDiscount] = useState(
    props.discountAmount > 0 ? String(props.discountAmount) : "",
  );
  const [discountReason, setDiscountReason] = useState(
    props.discountReason ?? "",
  );
  const [approvalReason, setApprovalReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lines = useMemo(
    () =>
      props.lines.map((line) => {
        const text = typed[lineKey(line)];
        return text === undefined
          ? line
          : { ...line, unitPrice: readMoney(text) };
      }),
    [props.lines, typed],
  );
  const total = compensationTotal(lines);
  const discountValue = editable
    ? (readMoney(discount) ?? 0)
    : props.discountAmount;
  const due = props.amountDue ?? Math.max(total - discountValue, 0);
  const summary = summaryByKind(lines);

  async function approve() {
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/compensations/${props.id}/approve`, {
      method: "POST",
      body: {
        updatedAt: props.updatedAt,
        approvalReason: approvalReason || null,
        discountAmount: discountValue,
        discountReason: discountReason || null,
        prices: props.lines
          .filter((line) => line.contractPrice === null)
          .map((line) => ({
            itemId: line.itemId,
            kind: line.kind,
            unitPrice:
              typed[lineKey(line)] === undefined
                ? line.unitPrice
                : readMoney(typed[lineKey(line)] ?? ""),
          })),
      },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function reject() {
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/compensations/${props.id}/reject`, {
      method: "POST",
      body: { updatedAt: props.updatedAt, reason: rejectReason },
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
      {editable ? (
        <section
          aria-labelledby="compensation-approval"
          className="flex flex-col gap-3 rounded-lg border-2 border-warning bg-card p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="compensation-approval" className="text-h2">
                Phiếu đền bù đang chờ bạn duyệt
              </h2>
              <p data-mask className="text-sm text-muted-foreground">
                Tự tạo từ phiếu thu hồi {props.returnCode} lúc{" "}
                {props.createdAtText}. Duyệt xong mới cộng vào công nợ.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setRejecting(true)}
              >
                Từ chối
              </Button>
              <Button disabled={busy} onClick={() => void approve()}>
                {busy ? "Đang duyệt…" : `Duyệt ${moneyText(due)}`}
              </Button>
            </div>
          </div>
          {props.overdue.amount > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="approval-reason">
                Lý do vẫn duyệt · bắt buộc vì nhà thầu đang nợ quá hạn{" "}
                {moneyText(props.overdue.amount)} ({props.overdue.days} ngày)
              </Label>
              <textarea
                id="approval-reason"
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-labelledby="compensation-lines"
            className="flex flex-col gap-3 rounded-lg border bg-card p-5"
          >
            <h2 id="compensation-lines" className="text-h2">
              Hàng hỏng và mất
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hàng</TableHead>
                  <TableHead>Tình trạng</TableHead>
                  <TableHead className="text-right">Số lượng</TableHead>
                  <TableHead className="text-right">Đơn giá đền</TableHead>
                  <TableHead className="text-right">Thành tiền</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => {
                  const key = lineKey(line);
                  const amount = compensationLineAmount(line);
                  const label = `Đơn giá ${line.itemCode} ${COMPENSATION_KIND_LABELS[line.kind]}`;
                  return (
                    <TableRow key={key}>
                      <TableCell>
                        <span className="font-medium">{line.itemName}</span>{" "}
                        <span className="text-caption text-muted-foreground">
                          {line.itemCode}
                        </span>
                      </TableCell>
                      <TableCell>
                        {COMPENSATION_KIND_LABELS[line.kind]}{" "}
                        <span className="text-caption text-muted-foreground">
                          · {COMPENSATION_PRICE_NOTES[line.kind]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {amountText(line.quantityMilli, line.unit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {editable && line.contractPrice === null ? (
                          <Input
                            aria-label={label}
                            inputMode="numeric"
                            placeholder="Chưa có giá"
                            value={typed[key] ?? ""}
                            onChange={(event) =>
                              setTyped((prev) => ({
                                ...prev,
                                [key]: event.target.value,
                              }))
                            }
                            className="ml-auto w-32 text-right"
                          />
                        ) : line.unitPrice === null ? (
                          <span className="text-warning">Chưa có giá</span>
                        ) : (
                          moneyText(line.unitPrice)
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {moneyText(amount)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4}>Cộng</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {moneyText(total)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
            <p className="text-sm text-muted-foreground">
              Đơn giá lấy từ bảng giá đền bù của {props.contractCode}. Phế liệu
              tính như mất. Hàng mất thôi tính tiền thuê từ ngày lập phiếu thu
              hồi ({formatBusinessDate(props.returnDate)}).
            </p>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          {editable ? (
            <section
              aria-labelledby="compensation-discount"
              className="flex flex-col gap-3 rounded-lg border bg-card p-5"
            >
              <h2 id="compensation-discount" className="text-h3">
                Giảm trừ{" "}
                <span className="text-caption text-muted-foreground">
                  · không bắt buộc
                </span>
              </h2>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="discount-amount">Số tiền giảm</Label>
                <Input
                  id="discount-amount"
                  inputMode="numeric"
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="discount-reason">
                  Lý do giảm{" "}
                  <span className="text-muted-foreground">
                    · bắt buộc nếu có giảm
                  </span>
                </Label>
                <textarea
                  id="discount-reason"
                  value={discountReason}
                  maxLength={500}
                  onChange={(event) => setDiscountReason(event.target.value)}
                  className="min-h-16 rounded-md border border-input bg-card px-3 py-2 text-base"
                />
              </div>
            </section>
          ) : null}

          <section
            aria-labelledby="compensation-amount"
            className="flex flex-col gap-2 rounded-lg border bg-card p-5"
          >
            <h2 id="compensation-amount" className="text-h3">
              Tiền đền bù
            </h2>
            <p className="text-h2 tabular-nums" aria-label="Số tiền đền bù">
              {props.status === "REJECTED" ? moneyText(0) : moneyText(due)}
            </p>
            {props.status === "APPROVED" && props.dueDate ? (
              <p className="text-sm text-muted-foreground">
                Đã cộng vào công nợ · hạn trả{" "}
                {formatBusinessDate(props.dueDate)}
              </p>
            ) : props.status === "PENDING" ? (
              <p className="text-sm text-muted-foreground">
                Cộng vào công nợ khi duyệt · hạn trả = ngày duyệt +{" "}
                {props.paymentTermsDays} ngày, theo {props.contractCode}.
              </p>
            ) : null}
            <ul className="flex flex-col gap-1 border-t pt-2 text-sm">
              {summary.map((row) => (
                <li key={row.kind} className="flex justify-between gap-3">
                  <span>
                    {COMPENSATION_KIND_LABELS[row.kind]} ·{" "}
                    {formatByUnit(row.quantities)}
                  </span>
                  <span className="tabular-nums">{moneyText(row.amount)}</span>
                </li>
              ))}
              {discountValue > 0 ? (
                <li className="flex justify-between gap-3">
                  <span>Giảm trừ</span>
                  <span className="tabular-nums">
                    −{moneyText(discountValue)}
                  </span>
                </li>
              ) : null}
            </ul>
          </section>

          {props.status === "APPROVED" ? (
            <section className="flex flex-col gap-1 rounded-lg border bg-card p-5 text-sm">
              <h2 className="text-h3">Đã duyệt</h2>
              <p data-mask>
                {props.approvedByName} duyệt ngày{" "}
                {props.approvedDate
                  ? formatBusinessDate(props.approvedDate)
                  : ""}
              </p>
              {props.discountAmount > 0 ? (
                <p>
                  Giảm {moneyText(props.discountAmount)}: {props.discountReason}
                </p>
              ) : null}
              {props.approvalReason ? (
                <p>Lý do duyệt khi nợ quá hạn: {props.approvalReason}</p>
              ) : null}
            </section>
          ) : null}
          {props.status === "REJECTED" ? (
            <section className="flex flex-col gap-1 rounded-lg border bg-card p-5 text-sm">
              <h2 className="text-h3">Đã từ chối</h2>
              <p>Lý do: {props.rejectedReason}</p>
            </section>
          ) : null}
        </aside>
      </div>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối phiếu đền bù?</DialogTitle>
            <DialogDescription>
              Từ chối thì không thu {moneyText(total)} đền bù của{" "}
              {props.returnCode}. Bạn không mở lại được phiếu này.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="reject-reason">Lý do từ chối</Label>
          <textarea
            id="reject-reason"
            value={rejectReason}
            maxLength={500}
            onChange={(event) => setRejectReason(event.target.value)}
            rows={3}
            className="rounded-md border border-input bg-card px-3 py-2 text-base"
          />
          <FormError message={error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(false)}>
              Thôi
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void reject()}
            >
              Từ chối phiếu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
