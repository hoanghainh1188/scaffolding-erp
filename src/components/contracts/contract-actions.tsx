"use client";

import { FilePlus2, Pencil, Printer } from "lucide-react";
import Link from "next/link";
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

interface ContractActionsProps {
  id: string;
  code: string;
  can: { edit: boolean; amend: boolean; cancel: boolean };
  openAmendment: number | null;
}

/** D5 buttons: edit the draft, print, amend, cancel. */
export function ContractActions({
  id,
  code,
  can,
  openAmendment,
}: ContractActionsProps) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function amend() {
    setBusy(true);
    setError(null);
    const result = await callApi<{ number: number }>(
      `/api/contracts/${id}/amendments`,
      { method: "POST" },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/sales/contracts/${id}/amendments/${result.data.number}`);
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/contracts/${id}/cancel`, {
      method: "POST",
      body: { reason },
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
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {can.edit ? (
          <Button asChild variant="outline">
            <Link href={`/sales/contracts/${id}/edit`}>
              <Pencil aria-hidden /> Sửa nháp
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href={`/sales/contracts/${id}/print`} target="_blank">
            <Printer aria-hidden /> In
          </Link>
        </Button>
        {openAmendment !== null ? (
          <Button asChild variant="outline">
            <Link href={`/sales/contracts/${id}/amendments/${openAmendment}`}>
              Phụ lục {String(openAmendment).padStart(2, "0")} đang mở
            </Link>
          </Button>
        ) : null}
        {can.amend ? (
          <Button disabled={busy} onClick={() => void amend()}>
            <FilePlus2 aria-hidden /> Lập phụ lục
          </Button>
        ) : null}
        {can.cancel ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setCancelling(true)}
          >
            Hủy hợp đồng
          </Button>
        ) : null}
      </div>
      {!cancelling ? <FormError message={error} /> : null}
      <Dialog open={cancelling} onOpenChange={setCancelling}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hủy hợp đồng {code}?</DialogTitle>
            <DialogDescription>
              Số hợp đồng vẫn giữ, không dùng lại. Phụ lục chưa duyệt (nếu có)
              bị hủy theo.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="cancel-reason">Lý do hủy</Label>
          <textarea
            id="cancel-reason"
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-16 rounded-md border border-input bg-card px-3 py-2 text-base"
          />
          <FormError message={error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(false)}>
              Không hủy
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void cancel()}
            >
              Hủy hợp đồng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
