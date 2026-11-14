"use client";

import { Printer } from "lucide-react";
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
import type { DeliveryStatus } from "@/domain/delivery-note";
import { callApi } from "@/lib/api-client";

type Command = "recall" | "cancel";

const TEXTS: Readonly<
  Record<
    Command,
    {
      button: string;
      title: (code: string) => string;
      hint: string;
      label: string;
    }
  >
> = {
  recall: {
    button: "Rút về để sửa",
    title: (code) => `Rút phiếu ${code} về để sửa?`,
    hint: "Thủ kho đang nhặt sẽ phải mở lại phiếu và nhặt theo số mới.",
    label: "Lý do rút về",
  },
  cancel: {
    button: "Hủy phiếu",
    title: (code) => `Hủy phiếu ${code}?`,
    hint: "Phiếu giữ số, không ghi sổ kho. Phần hàng vẫn còn trong số còn phải giao.",
    label: "Lý do hủy",
  },
};

interface NoteActionsProps {
  id: string;
  code: string;
  status: DeliveryStatus;
  canManage: boolean;
}

/** Note detail buttons: print, recall a note being picked, cancel. */
export function NoteActions({ id, code, status, canManage }: NoteActionsProps) {
  const router = useRouter();
  const [command, setCommand] = useState<Command | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!command) return;
    setBusy(true);
    setError(null);
    setReasonError(null);
    const result = await callApi(`/api/deliveries/${id}/${command}`, {
      method: "POST",
      body: { reason },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCommand(null);
    setReason("");
    router.refresh();
  }

  const open = status === "PLANNED" || status === "PICKING";
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {status !== "CANCELLED" ? (
        <Button asChild variant="outline">
          <Link href={`/sales/deliveries/${code}/print`} target="_blank">
            <Printer aria-hidden />{" "}
            {status === "POSTED" ? "In phiếu xuất" : "In phiếu nhặt hàng"}
          </Link>
        </Button>
      ) : null}
      {canManage && status === "PICKING" ? (
        <Button variant="outline" onClick={() => setCommand("recall")}>
          {TEXTS.recall.button}
        </Button>
      ) : null}
      {canManage && open ? (
        <Button variant="outline" onClick={() => setCommand("cancel")}>
          {TEXTS.cancel.button}
        </Button>
      ) : null}
      <Dialog
        open={command !== null}
        onOpenChange={(next) => (next ? null : setCommand(null))}
      >
        <DialogContent>
          {command ? (
            <>
              <DialogHeader>
                <DialogTitle>{TEXTS[command].title(code)}</DialogTitle>
                <DialogDescription>{TEXTS[command].hint}</DialogDescription>
              </DialogHeader>
              <Label htmlFor="note-reason" required>
                {TEXTS[command].label}
              </Label>
              <textarea
                id="note-reason"
                value={reason}
                required
                aria-invalid={reasonError ? true : undefined}
                onChange={(event) => {
                  setReason(event.target.value);
                  if (reasonError && event.target.value.trim() !== "") {
                    setReasonError(null);
                  }
                }}
                onBlur={(event) => {
                  if (event.target.value.trim() === "") {
                    setReasonError(
                      `Vui lòng nhập ${TEXTS[command].label.toLowerCase()}`,
                    );
                  }
                }}
                rows={3}
                className="rounded-md border border-input bg-card px-3 py-2 text-base aria-invalid:border-destructive"
              />
              {reasonError && !error && (
                <p className="text-caption text-destructive">{reasonError}</p>
              )}
              <FormError message={error} />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCommand(null)}
                  disabled={busy}
                >
                  Đóng
                </Button>
                <Button onClick={() => void send()} disabled={busy}>
                  {TEXTS[command].button}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
