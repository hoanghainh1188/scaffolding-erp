"use client";

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
import type { TransferStatus } from "@/domain/site-transfer";
import { callApi } from "@/lib/api-client";

/** "Rút về" a sent transfer and "Hủy" a draft or sent one (design D1). */
export function TransferActions({
  id,
  status,
  updatedAt,
}: {
  id: string;
  status: TransferStatus;
  updatedAt: string;
}) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/site-transfers/${id}/${path}`, {
      method: "POST",
      body,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCancelling(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "SENT" ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void call("pull-back", { updatedAt })}
          >
            Rút về để sửa
          </Button>
        ) : null}
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => setCancelling(true)}
        >
          Hủy phiếu
        </Button>
      </div>
      <FormError message={cancelling ? null : error} />
      <Dialog open={cancelling} onOpenChange={setCancelling}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hủy phiếu chuyển</DialogTitle>
            <DialogDescription>
              Hàng không chuyển, vẫn ở công trình đi.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transfer-cancel-reason" required>
              Lý do hủy
            </Label>
            <textarea
              id="transfer-cancel-reason"
              value={reason}
              required
              maxLength={500}
              aria-invalid={reasonError ? true : undefined}
              onChange={(event) => {
                setReason(event.target.value);
                if (reasonError && event.target.value.trim() !== "") {
                  setReasonError(null);
                }
              }}
              onBlur={(event) => {
                if (event.target.value.trim() === "") {
                  setReasonError("Vui lòng nhập lý do hủy phiếu chuyển");
                }
              }}
              className="min-h-16 rounded-md border border-input bg-card px-3 py-2 text-base aria-invalid:border-destructive"
            />
            {reasonError && !error && (
              <p className="text-caption text-destructive">{reasonError}</p>
            )}
          </div>
          <FormError message={error} />
          <DialogFooter>
            <Button
              disabled={busy}
              onClick={() => void call("cancel", { reason })}
            >
              Hủy phiếu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
