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
import { dict } from "@/locales";

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
              trigger={
                <Button variant="outline">
                  {dict.inventory.adjustments.deleteDraft}
                </Button>
              }
              title={dict.inventory.adjustments.deleteDraftTitle(code)}
              description={dict.inventory.adjustments.confirmDeleteDraft}
              confirmLabel={dict.inventory.adjustments.deleteDraft}
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
              {dict.inventory.adjustments.submitForApproval}
            </Button>
          </>
        ) : null}
        {status === "PENDING_APPROVAL" && canApprove ? (
          <>
            <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  {dict.inventory.adjustments.returnAction}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={giveBack} className="flex flex-col gap-4">
                  <DialogHeader>
                    <DialogTitle>
                      {dict.inventory.adjustments.returnTitle(code)}
                    </DialogTitle>
                    <DialogDescription>
                      {dict.inventory.adjustments.returnHelp}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="return-reason">
                      {dict.inventory.adjustments.returnReasonLabel}
                    </Label>
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
                      {dict.inventory.adjustments.returnAction}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <ConfirmAction
              trigger={
                <Button>{dict.inventory.adjustments.approveAndPost}</Button>
              }
              title={dict.inventory.adjustments.approveTitle(code)}
              description={dict.inventory.adjustments.confirmPost}
              confirmLabel={dict.inventory.adjustments.approveAndPost}
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
