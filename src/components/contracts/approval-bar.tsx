"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormError } from "@/components/catalog/form-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/domain/business-date";
import { formatMoney, toMoney } from "@/domain/money";
import { callApi } from "@/lib/api-client";

interface ApprovalBarProps {
  /** "/api/contracts/<id>" or ".../amendments/<n>". */
  path: string;
  what: "Hợp đồng" | "Phụ lục";
  submittedBy: string | null;
  submittedAt: string | null;
  /** Overdue debt of the customer now; 0 when none. */
  overdue: { amount: number; days: number };
}

/** D5 / D5b approval bar: director only (contracts spec). */
export function ApprovalBar({
  path,
  what,
  submittedBy,
  submittedAt,
  overdue,
}: ApprovalBarProps) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"approve" | "return" | null>(null);

  async function act(kind: "approve" | "return") {
    setError(null);
    setReasonError(null);
    setPending(kind);
    const result = await callApi(`${path}/${kind}`, {
      method: "POST",
      body: { reason: reason || null },
    });
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section
      aria-labelledby="approval-title"
      className="flex flex-col gap-3 rounded-lg border-2 border-warning bg-card p-5"
    >
      <h2 id="approval-title" className="text-h2">
        {what} này đang chờ bạn duyệt
      </h2>
      {submittedBy && submittedAt ? (
        <p data-mask className="text-sm text-muted-foreground">
          {submittedBy} gửi lúc {formatDateTime(new Date(submittedAt))}. Duyệt
          xong mới tạo được phiếu xuất.
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="approval-reason" required={overdue.amount > 0}>
          Lý do
          {overdue.amount > 0
            ? ` vẫn duyệt · bắt buộc vì nhà thầu đang nợ quá hạn ${formatMoney(toMoney(overdue.amount))} (${overdue.days} ngày)`
            : " · bắt buộc khi từ chối"}
        </Label>
        <textarea
          id="approval-reason"
          value={reason}
          maxLength={500}
          aria-invalid={reasonError ? true : undefined}
          onChange={(event) => {
            setReason(event.target.value);
            if (reasonError && event.target.value.trim() !== "") {
              setReasonError(null);
            }
          }}
          onBlur={(event) => {
            if (overdue.amount > 0 && event.target.value.trim() === "") {
              setReasonError("Vui lòng nhập lý do vẫn duyệt");
            }
          }}
          className="min-h-16 rounded-md border border-input bg-card px-3 py-2 text-base aria-invalid:border-destructive"
        />
        {reasonError && !error && (
          <p className="text-caption text-destructive">{reasonError}</p>
        )}
      </div>
      <FormError message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          disabled={pending !== null}
          onClick={() => void act("return")}
        >
          {pending === "return" ? "Đang trả lại…" : "Từ chối"}
        </Button>
        <Button disabled={pending !== null} onClick={() => void act("approve")}>
          {pending === "approve"
            ? "Đang duyệt…"
            : `Duyệt ${what.toLowerCase()}`}
        </Button>
      </div>
    </section>
  );
}
