"use client";

// "Hủy" a receipt (customer-receipts spec "Phiếu thu không sửa, hủy có lý
// do", 0.2 #83): asks for the reason; the debts it settled reopen.
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
import { callApi } from "@/lib/api-client";

interface CancelReceiptProps {
  id: string;
  code: string;
  amountText: string;
}

export function CancelReceipt(props: CancelReceiptProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) {
      setError("Bạn ghi lý do hủy phiếu thu.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await callApi(
      `/api/receivables/receipts/${props.id}/cancel`,
      {
        method: "POST",
        body: { reason },
      },
    );
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
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive"
        onClick={() => {
          setError(null);
          setReason("");
          setOpen(true);
        }}
      >
        Hủy
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hủy phiếu {props.code}?</DialogTitle>
            <DialogDescription>
              Phiếu {props.amountText} sẽ hết hiệu lực, các khoản đã trừ mở lại.
              Phiếu đã hủy vẫn giữ trên nhật ký.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`cancel-${props.id}`} required>
              Lý do hủy
            </Label>
            <textarea
              id={`cancel-${props.id}`}
              value={reason}
              aria-invalid={Boolean(error)}
              onChange={(event) => {
                setReason(event.target.value);
                if (error && event.target.value.trim()) {
                  setError(null);
                }
              }}
              onBlur={() => {
                if (!reason.trim()) {
                  setError("Bạn ghi lý do hủy phiếu thu.");
                }
              }}
              maxLength={500}
              rows={3}
              className="rounded-md border bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring aria-invalid:border-destructive"
            />
          </div>
          <FormError message={error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Thôi
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void submit()}
            >
              Hủy phiếu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
