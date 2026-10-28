"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { FormError } from "@/components/catalog/form-error";
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

interface ReasonDialogProps {
  trigger: ReactNode;
  title: string;
  description: string;
  label: string;
  confirmLabel: string;
  destructive?: boolean;
  pending: boolean;
  error: string | null;
  /** Returns true when done, so the dialog closes. */
  onConfirm: (reason: string) => Promise<boolean>;
}

/** "Trả lại" and "Hủy phiên": a reason, then the call (design D10). */
export function ReasonDialog({
  trigger,
  title,
  description,
  label,
  confirmLabel,
  destructive = false,
  pending,
  error,
  onConfirm,
}: ReasonDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onConfirm(reason)) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stocktake-reason">{label}</Label>
            <textarea
              id="stocktake-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              className="rounded-md border border-input bg-card px-3 py-2 text-base"
            />
          </div>
          <FormError message={error} />
          <DialogFooter>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={pending}
              className="h-11"
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
