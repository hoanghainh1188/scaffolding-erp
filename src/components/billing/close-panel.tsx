"use client";

// "In bảng kê" and "Chốt kỳ và ghi công nợ" of D7 (rental-billing spec
// "Chốt kỳ lưu số phải thu", "Điều kiện chốt kỳ"): the closing asks again
// with the amount, sends the amount the user saw, and shows the server's
// reason when it refuses (409).
import { CheckIcon, InfoIcon, PrinterIcon } from "lucide-react";
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
import { formatMoney, toMoney } from "@/domain/money";
import { formatMonth } from "@/domain/rental-billing";
import { callApi } from "@/lib/api-client";

interface ClosePanelProps {
  contractId: string;
  contractCode: string;
  month: string;
  totalAmount: number;
  /** Why it cannot be closed now; null when it can. */
  block: string | null;
  canClose: boolean;
  closed: boolean;
}

export function ClosePanel(props: ClosePanelProps) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function close() {
    setBusy(true);
    setError(null);
    const result = await callApi(
      `/api/billing/periods/${props.month}/contracts/${props.contractId}/close`,
      { method: "POST", body: { expectedTotal: props.totalAmount } },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      router.refresh();
      return;
    }
    setAsking(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm">
        <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        Chốt xong thì kỳ bị khóa. Sai sót sau đó ghi bằng dòng điều chỉnh ở kỳ
        sau.
      </p>
      <Button asChild variant="outline">
        <Link
          href={`/receivables/billing/${props.month}/${props.contractId}/print`}
        >
          <PrinterIcon aria-hidden /> In bảng kê
        </Link>
      </Button>
      {props.canClose && !props.closed ? (
        <>
          <Button
            disabled={props.block !== null}
            onClick={() => {
              setError(null);
              setAsking(true);
            }}
          >
            <CheckIcon aria-hidden /> Chốt kỳ và ghi công nợ
          </Button>
          {props.block ? (
            <p className="text-sm text-muted-foreground" role="status">
              {props.block}
            </p>
          ) : null}
        </>
      ) : null}
      <FormError message={asking ? null : error} />
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Chốt kỳ {formatMonth(props.month)} của {props.contractCode}?
            </DialogTitle>
            <DialogDescription>
              Phải thu {formatMoney(toMoney(props.totalAmount))} sẽ ghi vào công
              nợ. Chốt xong không sửa được kỳ này nữa.
            </DialogDescription>
          </DialogHeader>
          <FormError message={error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsking(false)}>
              Thôi
            </Button>
            <Button disabled={busy} onClick={() => void close()}>
              Chốt kỳ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
