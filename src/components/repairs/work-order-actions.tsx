"use client";

// The buttons of a work order on D12 (spec "Bước chuyển của văn phòng"):
// assign, recall, return to the workshop and cancel (both need a reason),
// post (asks again on a high repair cost, like the simple slip).
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
import { Label } from "@/components/ui/label";
import type { Anomaly } from "@/domain/receipt-anomalies";
import { repairAnomalyKey } from "@/domain/repair-order";
import type { WorkOrderStatus } from "@/domain/repair-work-order";
import { callApi } from "@/lib/api-client";

import { RepairAnomalyDialog } from "./repair-anomaly-dialog";

interface WorkOrderActionsProps {
  code: string;
  status: WorkOrderStatus;
  updatedAt: string;
  /** Item codes by line, to read a 422 cost question. */
  lineCodes: string[];
}

type Ask = "return" | "cancel" | null;

export function WorkOrderActions({
  code,
  status,
  updatedAt,
  lineCodes,
}: WorkOrderActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [reason, setReason] = useState("");
  const [anomaly, setAnomaly] = useState<{
    anomaly: Anomaly;
    confirmed: string[];
  } | null>(null);

  async function step(path: string, body: Record<string, unknown> = {}) {
    setPending(true);
    setError(null);
    const result = await callApi(`/api/repairs/${code}/${path}`, {
      method: "POST",
      body: { updatedAt, ...body },
    });
    setPending(false);
    if (!result.ok) {
      const row = /^lines\.(\d+)\.repairCost$/.exec(result.field ?? "");
      const itemCode = row ? lineCodes[Number(row[1])] : undefined;
      if (path === "post" && itemCode && result.error.endsWith("Đúng không?")) {
        setAnomaly({
          anomaly: {
            key: repairAnomalyKey(itemCode),
            field: result.field ?? "",
            question: result.error,
            note: "",
          },
          confirmed: (body.confirmedOverrides as string[] | undefined) ?? [],
        });
        return;
      }
      setError(result.error);
      return;
    }
    setAsk(null);
    setReason("");
    router.refresh();
  }

  const canAssign = status === "DRAFT";
  const canRecall = status === "ASSIGNED";
  const canReturn = status === "AWAITING_CHECK" || status === "COUNTED";
  const canPost = status === "COUNTED";
  const canCancel = !["POSTED", "CANCELLED"].includes(status);

  return (
    <div className="flex flex-col gap-3">
      {canPost ? (
        <Button
          size="lg"
          className="h-12"
          disabled={pending}
          onClick={() => step("post", { confirmedOverrides: [] })}
        >
          Ghi sổ kho
        </Button>
      ) : null}
      {canAssign ? (
        <Button
          size="lg"
          className="h-12"
          disabled={pending}
          onClick={() => step("assign")}
        >
          Giao xưởng
        </Button>
      ) : null}
      {canRecall ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => step("recall")}
        >
          Thu hồi lệnh
        </Button>
      ) : null}
      {canReturn ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => setAsk("return")}
        >
          Trả lại xưởng sửa số
        </Button>
      ) : null}
      {canCancel && status !== "DRAFT" ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => setAsk("cancel")}
        >
          Hủy lệnh
        </Button>
      ) : null}
      {error ? (
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
              {ask === "return" ? "Trả lại xưởng sửa số" : "Hủy lệnh sửa"}
            </DialogTitle>
            <DialogDescription>
              {ask === "return"
                ? "Xưởng sẽ thấy lý do trên điện thoại và báo sửa xong lại."
                : "Hàng xưởng đã nhận sẽ tự chuyển về chỗ lấy hàng."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="work-order-reason" required>
              Lý do
            </Label>
            <textarea
              id="work-order-reason"
              value={reason}
              required
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
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
                step(ask === "return" ? "return" : "cancel", { reason })
              }
            >
              {ask === "return" ? "Trả lại xưởng" : "Hủy lệnh"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RepairAnomalyDialog
        anomaly={anomaly?.anomaly ?? null}
        onCancel={() => setAnomaly(null)}
        onConfirm={() => {
          const confirmed = [
            ...(anomaly?.confirmed ?? []),
            anomaly?.anomaly.key ?? "",
          ];
          setAnomaly(null);
          void step("post", { confirmedOverrides: confirmed });
        }}
      />
    </div>
  );
}
