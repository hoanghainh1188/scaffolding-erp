"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ConfirmAction } from "@/components/catalog/confirm-action";
import { FormError } from "@/components/catalog/form-error";
import { useCatalogAction } from "@/components/catalog/use-catalog-action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { PurchaseStatus } from "@/domain/purchase-order";

interface OrderActionsProps {
  code: string;
  status: PurchaseStatus;
  hasReceipts: boolean;
}

/**
 * Cancel and close need a few words (design D6), so they open a dialog;
 * place and delete a confirmation. Shown only to purchasing.manage.
 */
export function OrderActions({ code, status, hasReceipts }: OrderActionsProps) {
  const router = useRouter();
  const action = useCatalogAction();
  const [ending, setEnding] = useState<"cancel" | "close" | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const base = `/api/purchasing/orders/${code}`;

  async function end(event: FormEvent) {
    event.preventDefault();
    if (!ending) return;
    setReasonError(null);
    const done = await action.run(`${base}/${ending}`, {
      method: "POST",
      body: { reason },
    });
    if (done) {
      setEnding(null);
      setReason("");
    }
  }

  const endDialog = (kind: "cancel" | "close") => (
    <Dialog
      open={ending === kind}
      onOpenChange={(open) => {
        setEnding(open ? kind : null);
        action.setError(null);
        setReasonError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant={kind === "cancel" ? "outline" : "default"}>
          {kind === "cancel" ? "Hủy đơn" : "Đóng đơn, không chờ nữa"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={end} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              {kind === "cancel" ? `Hủy ${code}?` : `Đóng ${code}?`}
            </DialogTitle>
            <DialogDescription>
              {kind === "cancel"
                ? "Đơn không còn ở mục Xe sắp về. Mã đơn và lịch sử vẫn giữ."
                : "Không chờ giao bù nữa: tiền trả người bán chốt theo số đã nhận."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="end-reason" required={kind === "cancel"}>
              {kind === "cancel" ? "Lý do hủy" : "Lý do (không bắt buộc)"}
            </Label>
            <textarea
              id="end-reason"
              value={reason}
              required={kind === "cancel"}
              aria-invalid={reasonError ? true : undefined}
              onChange={(event) => {
                setReason(event.target.value);
                if (reasonError && event.target.value.trim() !== "") {
                  setReasonError(null);
                }
              }}
              onBlur={(event) => {
                if (kind === "cancel" && event.target.value.trim() === "") {
                  setReasonError("Vui lòng nhập lý do hủy đơn");
                }
              }}
              rows={3}
              maxLength={500}
              className="rounded-md border border-input bg-card px-3 py-2 text-base aria-invalid:border-destructive"
            />
            {reasonError && !action.error && (
              <p className="text-caption text-destructive">{reasonError}</p>
            )}
          </div>
          <FormError message={action.error} />
          <DialogFooter>
            <Button
              type="submit"
              variant={kind === "cancel" ? "destructive" : "default"}
              disabled={action.pending}
            >
              {kind === "cancel" ? "Hủy đơn" : "Đóng đơn"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  if (status === "DONE") return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "DRAFT" ? (
          <>
            <ConfirmAction
              trigger={<Button>Đặt đơn</Button>}
              title={`Đặt ${code}?`}
              description='Đơn hiện ở mục "Xe sắp về" trên điện thoại của thủ kho.'
              confirmLabel="Đặt đơn"
              error={action.error}
              onConfirm={async () =>
                Boolean(await action.run(`${base}/place`, { method: "POST" }))
              }
            />
            <ConfirmAction
              trigger={<Button variant="outline">Xóa nháp</Button>}
              title={`Xóa ${code}?`}
              description="Đơn nháp bị xóa hẳn. Mã đơn không cấp lại."
              confirmLabel="Xóa"
              destructive
              error={action.error}
              onConfirm={async () => {
                const done = await action.run(base, { method: "DELETE" });
                if (done) router.push("/purchasing");
                return Boolean(done);
              }}
            />
          </>
        ) : hasReceipts ? (
          endDialog("close")
        ) : (
          endDialog("cancel")
        )}
      </div>
      {ending === null ? <FormError message={action.error} /> : null}
    </div>
  );
}
