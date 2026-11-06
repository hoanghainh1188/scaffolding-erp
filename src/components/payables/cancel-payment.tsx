"use client";

// "Hủy" a supplier payment (supplier-payments spec "Phiếu chi không sửa,
// hủy có lý do", 0.2 số 100): asks for the reason; what it paid reopens.
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
import { PAYABLE_MESSAGES } from "@/domain/payables";
import { callApi } from "@/lib/api-client";

interface CancelPaymentProps {
  id: string;
  code: string;
  amountText: string;
}

export function CancelPayment(props: CancelPaymentProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) {
      setError(PAYABLE_MESSAGES.reasonRequired);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/payables/payments/${props.id}/cancel`, {
      method: "POST",
      body: { reason },
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
              Phiếu {props.amountText} sẽ hết hiệu lực, khoản đã trừ mở lại.
              Phiếu đã hủy vẫn giữ trên nhật ký.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`cancel-${props.id}`}>Lý do hủy</Label>
            <textarea
              id={`cancel-${props.id}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={3}
              className="rounded-md border bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
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
