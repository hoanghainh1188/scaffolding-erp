"use client";

// Ask again before posting (goods-receipt design D5b): "Sửa lại" goes back
// to the field, "Đúng, …" confirms and sends.
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Anomaly } from "@/domain/receipt-anomalies";

interface AnomalyDialogProps {
  anomaly: Anomaly | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/** "Nhận 2.000 cái, đơn chỉ còn 200. Đúng không?" → "Đúng, nhập 2.000 cái". */
export function confirmLabel(anomaly: Anomaly): string {
  const amount = /^(?:Nhận|Chi phí chuyến) ([^,]+),/.exec(
    anomaly.question,
  )?.[1];
  if (!amount) return "Đúng";
  return anomaly.key === "costs"
    ? `Đúng, chi phí ${amount}`
    : `Đúng, nhập ${amount}`;
}

export function AnomalyDialog({
  anomaly,
  onCancel,
  onConfirm,
}: AnomalyDialogProps) {
  return (
    <AlertDialog
      open={anomaly !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Kiểm tra lại số này</AlertDialogTitle>
          <AlertDialogDescription>{anomaly?.question}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Sửa lại</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {anomaly ? confirmLabel(anomaly) : "Đúng"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
