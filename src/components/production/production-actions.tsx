"use client";

// The buttons of an order on D20 (spec "Bước của văn phòng", "Giám đốc duyệt
// vượt định mức"): what shows depends on the status and on who is looking.
// Return and cancel ask for a note; approval has its own note on the page.
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductionStatus } from "@/domain/production-order";
import { callApi } from "@/lib/api-client";

interface ProductionActionsProps {
  code: string;
  status: ProductionStatus;
  updatedAt: string;
  canManage: boolean;
  canApprove: boolean;
}

type Ask = "return" | "cancel" | null;

const RETURNABLE: readonly ProductionStatus[] = [
  "AWAITING_CHECK",
  "AWAITING_APPROVAL",
  "COUNTED",
];

export function ProductionActions({
  code,
  status,
  updatedAt,
  canManage,
  canApprove,
}: ProductionActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [note, setNote] = useState("");
  const [approveNote, setApproveNote] = useState("");

  async function step(path: string, body: Record<string, unknown> = {}) {
    setPending(true);
    setError(null);
    const result = await callApi(`/api/production/orders/${code}/${path}`, {
      method: "POST",
      body: { updatedAt, ...body },
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAsk(null);
    setNote("");
    router.refresh();
  }

  const showApprove = canApprove && status === "AWAITING_APPROVAL";
  const canCancel = !["POSTED", "CANCELLED", "DRAFT"].includes(status);
  const showManage =
    canManage &&
    (status === "COUNTED" ||
      status === "ASSIGNED" ||
      RETURNABLE.includes(status) ||
      canCancel);
  if (!showApprove && !showManage) return null;

  return (
    <div className="flex flex-col gap-3">
      {showApprove ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="approve-note">Ghi chú duyệt</Label>
          <Input
            id="approve-note"
            value={approveNote}
            maxLength={500}
            onChange={(event) => setApproveNote(event.target.value)}
          />
          <Button
            className="h-12"
            disabled={pending}
            onClick={() => void step("approve", { note: approveNote })}
          >
            Duyệt vượt định mức
          </Button>
        </div>
      ) : null}
      {canManage && status === "COUNTED" ? (
        <Button
          className="h-12"
          disabled={pending}
          onClick={() => void step("post")}
        >
          Ghi sổ
        </Button>
      ) : null}
      {canManage && status === "ASSIGNED" ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => void step("recall")}
        >
          Thu hồi lệnh
        </Button>
      ) : null}
      {canManage && RETURNABLE.includes(status) ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => setAsk("return")}
        >
          Trả lại xưởng sửa số
        </Button>
      ) : null}
      {canManage && canCancel ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => setAsk("cancel")}
        >
          Hủy lệnh
        </Button>
      ) : null}
      {error && ask === null ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Dialog
        open={ask !== null}
        onOpenChange={(open) => (open ? null : setAsk(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {ask === "return" ? "Trả lại xưởng sửa số" : "Hủy lệnh sản xuất"}
            </DialogTitle>
            <DialogDescription>
              {ask === "return"
                ? "Số Thủ kho đếm và lần duyệt sẽ bị bỏ, xưởng báo lại."
                : "Lệnh chưa ghi sổ nên không có dòng sổ kho nào."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="production-note">
              {ask === "return" ? "Ghi chú" : "Lý do"}
            </Label>
            <textarea
              id="production-note"
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-24 rounded-md border bg-card px-3 py-2 text-base"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsk(null)}>
              Thôi
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                void (ask === "return"
                  ? step("return", { note })
                  : step("cancel", { reason: note }))
              }
            >
              {ask === "return" ? "Trả lại xưởng" : "Hủy lệnh"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
