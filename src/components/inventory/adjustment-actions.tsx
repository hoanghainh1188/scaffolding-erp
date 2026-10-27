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
import type { AdjustmentStatus } from "@/lib/inventory/adjustments";

interface AdjustmentActionsProps {
  id: string;
  code: string;
  status: AdjustmentStatus;
  canAdjust: boolean;
  canApprove: boolean;
}

/** Submit, delete, approve and return, each shown only when allowed. */
export function AdjustmentActions({
  id,
  code,
  status,
  canAdjust,
  canApprove,
}: AdjustmentActionsProps) {
  const router = useRouter();
  const action = useCatalogAction();
  const [returnOpen, setReturnOpen] = useState(false);
  const [why, setWhy] = useState("");
  const base = `/api/inventory/adjustments/${id}`;

  async function giveBack(event: FormEvent) {
    event.preventDefault();
    const done = await action.run(`${base}/return`, {
      method: "POST",
      body: { reason: why },
    });
    if (done) setReturnOpen(false);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {status === "DRAFT" && canAdjust ? (
          <>
            <ConfirmAction
              trigger={<Button variant="outline">Xóa nháp</Button>}
              title={`Xóa ${code}?`}
              description="Phiếu nháp bị xóa hẳn. Sổ kho không đổi."
              confirmLabel="Xóa"
              destructive
              error={action.error}
              onConfirm={async () => {
                const done = await action.run(base, { method: "DELETE" });
                if (done) router.push("/inventory/adjustments");
                return Boolean(done);
              }}
            />
            <Button
              disabled={action.pending}
              onClick={() => action.run(`${base}/submit`, { method: "POST" })}
            >
              Gửi duyệt
            </Button>
          </>
        ) : null}
        {status === "PENDING_APPROVAL" && canApprove ? (
          <>
            <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Trả lại</Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={giveBack} className="flex flex-col gap-4">
                  <DialogHeader>
                    <DialogTitle>Trả lại {code}</DialogTitle>
                    <DialogDescription>
                      Phiếu về Nháp để người lập sửa. Ghi rõ cần sửa gì.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="return-reason">Lý do trả lại</Label>
                    <textarea
                      id="return-reason"
                      value={why}
                      onChange={(event) => setWhy(event.target.value)}
                      rows={3}
                      maxLength={500}
                      className="rounded-md border border-input bg-card px-3 py-2 text-base"
                    />
                  </div>
                  <FormError message={action.error} />
                  <DialogFooter>
                    <Button type="submit" disabled={action.pending}>
                      Trả lại
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <ConfirmAction
              trigger={<Button>Duyệt và ghi sổ</Button>}
              title={`Duyệt ${code}?`}
              description="Các dòng của phiếu được ghi vào sổ kho ngay và không sửa được nữa."
              confirmLabel="Duyệt và ghi sổ"
              error={action.error}
              onConfirm={async () =>
                Boolean(await action.run(`${base}/approve`, { method: "POST" }))
              }
            />
          </>
        ) : null}
      </div>
      {!returnOpen ? <FormError message={action.error} /> : null}
    </div>
  );
}
