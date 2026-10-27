"use client";

import { useState, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { FormError } from "./form-error";

interface ConfirmActionProps {
  /** Omit when the dialog is opened from elsewhere (open / onOpenChange). */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Why the last attempt failed, shown inside the dialog. */
  error?: string | null;
  /** Returns true when done, so the dialog closes; false keeps it open. */
  onConfirm: () => Promise<boolean>;
}

/** Archive / delete behind a confirmation (master-data design D13). */
export function ConfirmAction({
  trigger,
  open: openProp,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  error = null,
  onConfirm,
}: ConfirmActionProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      ) : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel>Hủy</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            variant={destructive ? "destructive" : "default"}
            onClick={async (event) => {
              event.preventDefault();
              setBusy(true);
              const done = await onConfirm();
              setBusy(false);
              if (done) setOpen(false);
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
