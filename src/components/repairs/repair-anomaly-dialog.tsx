"use client";

// Ask again before posting a high repair cost (simple-repair design D6):
// "Sửa lại" goes back to the cost, "Đúng, ghi sổ" confirms and posts.
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

interface RepairAnomalyDialogProps {
  anomaly: Anomaly | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RepairAnomalyDialog({
  anomaly,
  onCancel,
  onConfirm,
}: RepairAnomalyDialogProps) {
  return (
    <AlertDialog
      open={anomaly !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Kiểm tra lại chi phí sửa</AlertDialogTitle>
          <AlertDialogDescription>{anomaly?.question}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Sửa lại</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Đúng, ghi sổ
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
