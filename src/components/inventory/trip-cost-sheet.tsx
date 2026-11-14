"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import { FormError } from "@/components/catalog/form-error";
import { useCatalogAction } from "@/components/catalog/use-catalog-action";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatBusinessDate } from "@/domain/business-date";
import { DomainValueError } from "@/domain/errors";
import { parseMoney } from "@/domain/money";
import type { AdjustmentDetail } from "@/lib/inventory/adjustments";
import type { ReceiptOption } from "@/lib/inventory/revaluations";

import { formatCost } from "./format";
import { NumericInput } from "@/components/domain/numeric-input";

interface TripCostSheetProps {
  receipts: ReceiptOption[];
  /** Editing this draft; absent to create one. */
  adjustment?: AdjustmentDetail;
  trigger?: ReactNode;
  defaultOpen?: boolean;
}

const selectClass =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-base";

/**
 * Correct the trip cost of a goods receipt: the lines are split again
 * exactly as the receipt did (spec stock-value-adjustments).
 */
export function TripCostSheet({
  receipts,
  adjustment,
  trigger,
  defaultOpen = false,
}: TripCostSheetProps) {
  const router = useRouter();
  const action = useCatalogAction();
  const [open, setOpen] = useState(defaultOpen);
  const [receiptId, setReceiptId] = useState(
    adjustment?.sourceReceiptId ?? receipts[0]?.id ?? "",
  );
  const [cost, setCost] = useState(
    adjustment?.correctedTripCost === null ||
      adjustment?.correctedTripCost === undefined
      ? ""
      : String(adjustment.correctedTripCost),
  );
  const [reason, setReason] = useState(adjustment?.reason ?? "");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const chosen = receipts.find((receipt) => receipt.id === receiptId);
  const recorded = adjustment
    ? adjustment.recordedTripCost
    : (chosen?.recordedCost ?? null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    let correctedTripCost: number;
    try {
      correctedTripCost = parseMoney(cost);
    } catch (cause: unknown) {
      if (cause instanceof DomainValueError) {
        action.setError(cause.message);
        return;
      }
      throw cause;
    }
    const saved = await action.run<{ id: string }>(
      adjustment
        ? `/api/inventory/adjustments/${adjustment.id}/trip-cost`
        : "/api/inventory/adjustments/trip-cost",
      {
        method: adjustment ? "PATCH" : "POST",
        body: {
          receiptId,
          correctedTripCost,
          reason,
          updatedAt: adjustment?.updatedAt ?? null,
        },
      },
    );
    if (!saved) return;
    setOpen(false);
    if (!adjustment && saved.data)
      router.push(`/inventory/adjustments/${saved.data.id}`);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            {adjustment ? `Sửa ${adjustment.code}` : "Sửa chi phí chuyến"}
          </SheetTitle>
          <SheetDescription>
            Nhập tổng chi phí chuyến đúng. Hệ thống chia lại như phiếu nhập đã
            chia và lập các dòng chênh lệch.
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={submit}
          className="flex flex-col gap-4 px-4 pb-6"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trip-receipt" required>
              Phiếu nhập
            </Label>
            {adjustment ? (
              <p id="trip-receipt" className="font-semibold">
                {adjustment.sourceReceiptCode}
              </p>
            ) : receipts.length === 0 ? (
              <p id="trip-receipt" className="text-muted-foreground">
                Chưa có phiếu nhập nào.
              </p>
            ) : (
              <select
                id="trip-receipt"
                value={receiptId}
                onChange={(event) => setReceiptId(event.target.value)}
                className={selectClass}
              >
                {receipts.map((receipt) => (
                  <option key={receipt.id} value={receipt.id}>
                    {receipt.code} · {receipt.orderCode} ·{" "}
                    {formatBusinessDate(receipt.businessDate)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="text-sm">
            Chi phí chuyến đã ghi:{" "}
            <span className="font-semibold tabular-nums">
              {formatCost(recorded)}
            </span>
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trip-cost" required>
              Chi phí chuyến đúng (₫)
            </Label>
            <NumericInput
              id="trip-cost"
              kind="money"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              className="w-64"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trip-reason" required>
              Lý do
            </Label>
            <textarea
              id="trip-reason"
              value={reason}
              aria-invalid={Boolean(reasonError)}
              onChange={(event) => {
                setReason(event.target.value);
                if (reasonError && event.target.value.trim()) {
                  setReasonError(null);
                }
              }}
              onBlur={() => {
                if (!reason.trim()) {
                  setReasonError("Vui lòng nhập lý do.");
                }
              }}
              maxLength={500}
              rows={3}
              className="rounded-md border border-input bg-card px-3 py-2 text-base aria-invalid:border-destructive"
              placeholder="VD: Cước xe 3.500.000 ₫ nhập nhầm thành 35.000.000 ₫"
            />
            {reasonError && action.error !== reasonError ? (
              <p className="text-caption text-destructive">{reasonError}</p>
            ) : null}
          </div>
          <FormError message={action.error} />
          <Button
            type="submit"
            size="lg"
            className="h-12"
            disabled={action.pending || (!adjustment && receipts.length === 0)}
          >
            {action.pending
              ? "Đang lưu…"
              : adjustment
                ? "Lưu thay đổi"
                : "Lập phiếu nháp"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
