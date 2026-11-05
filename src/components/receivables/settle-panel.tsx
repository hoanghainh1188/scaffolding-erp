"use client";

// "Cấn trừ cọc" block of D14b (contract-settlement spec "Ghi hoàn cọc
// thừa", "Thanh lý trong một transaction"): refund date and method when
// something is refunded, a confirm, the refund the user saw sent along.
import { CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormError } from "@/components/catalog/form-error";
import { DateInput } from "@/components/domain/date-input";
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
import { callApi } from "@/lib/api-client";

import { money } from "./format";

interface SettlePanelProps {
  contractId: string;
  contractCode: string;
  deposit: number;
  offset: number;
  refund: number;
  debtCount: number;
  today: string;
  ready: boolean;
  canSettle: boolean;
}

export function SettlePanel(props: SettlePanelProps) {
  const router = useRouter();
  const [date, setDate] = useState(props.today);
  const [method, setMethod] = useState<"TRANSFER" | "CASH">("TRANSFER");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function settle() {
    setBusy(true);
    setError(null);
    const result = await callApi(
      `/api/receivables/contracts/${props.contractId}/settlement`,
      {
        method: "POST",
        body: {
          expectedRefund: props.refund,
          refundDate: props.refund > 0 ? date : null,
          refundMethod: props.refund > 0 ? method : null,
        },
      },
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
    <section
      aria-labelledby="setoff-title"
      className="flex flex-col gap-4 rounded-lg border bg-card p-5"
    >
      <div className="flex flex-col gap-1 rounded-md bg-accent p-4">
        <span className="text-caption text-muted-foreground">
          Hoàn lại khách
        </span>
        <span className="text-h1 tabular-nums" data-mask>
          {money(props.refund)}
        </span>
        <span className="text-caption text-muted-foreground" data-mask>
          Cọc {money(props.deposit)} − nợ {money(props.offset)}
        </span>
      </div>
      <h2 id="setoff-title" className="text-h2">
        Cấn trừ cọc
      </h2>
      <dl className="flex flex-col gap-2 text-sm" data-mask>
        <div className="flex justify-between">
          <dt>Cọc tiền đã nhận</dt>
          <dd className="tabular-nums">{money(props.deposit)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Trừ vào {props.debtCount} khoản còn nợ</dt>
          <dd className="tabular-nums">− {money(props.offset)}</dd>
        </div>
        <div className="flex justify-between border-t pt-2 font-semibold">
          <dt>Hoàn lại khách</dt>
          <dd className="tabular-nums">{money(props.refund)}</dd>
        </div>
      </dl>
      {props.refund > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="refund-date">Ngày hoàn</Label>
            <DateInput
              id="refund-date"
              value={date}
              onValueChange={setDate}
              max={props.today}
            />
          </div>
          <fieldset className="flex gap-4 text-sm">
            <legend className="mb-1.5 text-label">Hình thức</legend>
            {(
              [
                ["TRANSFER", "Chuyển khoản"],
                ["CASH", "Tiền mặt"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="refund-method"
                  checked={method === value}
                  onChange={() => setMethod(value)}
                  className="accent-primary"
                />
                {label}
              </label>
            ))}
          </fieldset>
        </div>
      ) : null}
      <p className="text-caption text-muted-foreground">
        Cọc thiếu thì phần nợ còn lại vẫn ở Công nợ như khoản thường. Bảo lãnh
        (nếu có) không phải tiền: trả lại chứng thư khi thanh lý.
      </p>
      <p className="text-caption text-muted-foreground">
        Thanh lý xong hợp đồng bị khóa: không xuất, không thu hồi, không lập phụ
        lục.
      </p>
      <FormError message={asking ? null : error} />
      {props.canSettle ? (
        <Button
          disabled={!props.ready}
          onClick={() => {
            setError(null);
            setAsking(true);
          }}
        >
          <CheckIcon aria-hidden /> Thanh lý và ghi cấn trừ cọc
        </Button>
      ) : null}
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thanh lý {props.contractCode}?</DialogTitle>
            <DialogDescription>
              Cấn trừ {money(props.offset)} từ cọc, hoàn lại khách{" "}
              {money(props.refund)}. Thanh lý xong không mở lại được.
            </DialogDescription>
          </DialogHeader>
          <FormError message={error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsking(false)}>
              Thôi
            </Button>
            <Button disabled={busy} onClick={() => void settle()}>
              Thanh lý
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
