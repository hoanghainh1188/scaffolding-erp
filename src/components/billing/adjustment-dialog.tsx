"use client";

// Adjustments of D7 (0.2 #22, #80; rental-billing spec "Dòng điều chỉnh kỳ
// trước"): add one to the open month, edit or delete it while the month is
// open. The amount may be negative (refund); the reason is required.
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormError } from "@/components/catalog/form-error";
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
import { formatMonth } from "@/domain/rental-billing";
import { NumericInput } from "@/components/domain/numeric-input";
import { callApi } from "@/lib/api-client";

export interface AdjustmentDraft {
  id: string;
  refMonth: string;
  amount: number;
  reason: string;
  updatedAt: string;
}

interface AdjustmentDialogProps {
  contractId: string;
  month: string;
  /** Closed months before `month`, newest first. */
  closedMonths: readonly string[];
  /** Absent: a new line. */
  existing?: AdjustmentDraft;
}

/** "-50.000" → −50000; null when it is not a whole amount. */
export function readSignedMoney(text: string): number | null {
  const cleaned = text.replace(/[\s.₫]/g, "").replace("−", "-");
  if (!/^-?\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

export function AdjustmentDialog(props: AdjustmentDialogProps) {
  const router = useRouter();
  const editing = props.existing;
  const [open, setOpen] = useState(false);
  const [refMonth, setRefMonth] = useState(
    editing?.refMonth ?? props.closedMonths[0] ?? "",
  );
  const [amount, setAmount] = useState(
    editing ? editing.amount.toLocaleString("vi-VN") : "",
  );
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    const value = readSignedMoney(amount);
    const body = {
      contractId: props.contractId,
      month: props.month,
      refMonth,
      amount: value ?? 0,
      reason,
      updatedAt: editing?.updatedAt,
    };
    const result = editing
      ? await callApi(`/api/billing/adjustments/${editing.id}`, {
          method: "PUT",
          body,
        })
      : await callApi("/api/billing/adjustments", { method: "POST", body });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/billing/adjustments/${editing.id}`, {
      method: "DELETE",
      body: { updatedAt: editing.updatedAt },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {editing ? (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Sửa dòng điều chỉnh kỳ ${formatMonth(editing.refMonth)}`}
          onClick={() => setOpen(true)}
        >
          <PencilIcon aria-hidden />
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={props.closedMonths.length === 0}
          onClick={() => setOpen(true)}
        >
          <PlusIcon aria-hidden /> Thêm dòng điều chỉnh
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Sửa dòng điều chỉnh" : "Thêm dòng điều chỉnh"}
            </DialogTitle>
            <DialogDescription>
              Ghi sai sót của kỳ đã chốt vào kỳ {formatMonth(props.month)}. Kỳ
              cũ giữ nguyên. Ghi số âm nếu tính thừa cho khách.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            <Label htmlFor="adjustment-ref">Kỳ được điều chỉnh</Label>
            <select
              id="adjustment-ref"
              value={refMonth}
              onChange={(event) => setRefMonth(event.target.value)}
              className="h-10 rounded-md border border-input bg-card px-3 text-base"
            >
              {props.closedMonths.map((entry) => (
                <option key={entry} value={entry}>
                  {formatMonth(entry)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="adjustment-amount">Số tiền (₫)</Label>
            <NumericInput
              id="adjustment-amount"
              kind="signed-money"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="max-w-48 text-right tabular-nums"
              placeholder="93.000 hoặc -50.000"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="adjustment-reason">Lý do</Label>
            <textarea
              id="adjustment-reason"
              value={reason}
              maxLength={500}
              rows={3}
              onChange={(event) => setReason(event.target.value)}
              className="rounded-md border border-input bg-card px-3 py-2 text-base"
              placeholder="VD: Kỳ 01 thiếu 10 CHEO1,7 × 31 ngày (giao 31/12 chưa ghi)"
            />
          </div>
          <FormError message={error} />
          <DialogFooter className="gap-2">
            {editing ? (
              confirmDelete ? (
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  Xóa hẳn dòng này
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2Icon aria-hidden /> Xóa
                </Button>
              )
            ) : null}
            <Button variant="outline" onClick={() => setOpen(false)}>
              Thôi
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
