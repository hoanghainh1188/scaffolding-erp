"use client";

// "Ghi phiếu chi" of D14c (supplier-payments spec): "Trả tiền hàng" pays the
// receipts due first or the ones named, the rest becomes an advance; "Ứng
// trước" only for a seller who owes nothing (0.2 số 100, số 102). The server
// previews the split and records it with the same rules; the form never
// computes money itself.
import { CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { FormError } from "@/components/catalog/form-error";
import { DateInput } from "@/components/domain/date-input";
import { dayMonth, money } from "@/components/receivables/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { parseMoney } from "@/domain/money";
import { PAYABLE_MESSAGES, type PaymentKind } from "@/domain/payables";
import { callApi } from "@/lib/api-client";
import type { PaymentPlan } from "@/lib/payables/payments";
import { NumericInput } from "@/components/domain/numeric-input";
import { cn } from "@/lib/utils";

export interface OpenPayableOption {
  id: string;
  code: string;
  issuedDate: string;
  dueDate: string;
  remaining: number;
}

interface PaymentFormProps {
  supplierId: string;
  supplierName: string;
  /** "Vietcombank ···5678": all the software keeps of the account. */
  bankRef: string | null;
  today: string;
  payables: readonly OpenPayableOption[];
}

function readAmount(text: string): number | null {
  if (!text.trim()) return null;
  try {
    const value = parseMoney(text);
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

const newRequestId = () => crypto.randomUUID();

export function PaymentForm(props: PaymentFormProps) {
  const router = useRouter();
  const [requestId, setRequestId] = useState(newRequestId);
  const [amountText, setAmountText] = useState("");
  const [date, setDate] = useState(props.today);
  const [method, setMethod] = useState<"TRANSFER" | "CASH">("TRANSFER");
  const [kind, setKind] = useState<PaymentKind>("PAYMENT");
  const [manual, setManual] = useState(false);
  const [named, setNamed] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<PaymentPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amount = readAmount(amountText);
  const allocations = useMemo(
    () =>
      manual && kind === "PAYMENT"
        ? props.payables
            .map((row) => ({
              goodsReceiptId: row.id,
              amount: readAmount(named[row.id] ?? "") ?? 0,
              seen: row.remaining,
            }))
            .filter((part) => part.amount > 0)
        : [],
    [manual, kind, named, props.payables],
  );
  const body = useMemo(
    () => ({
      requestId,
      supplierId: props.supplierId,
      kind,
      amount: amount ?? 0,
      method,
      paidDate: date,
      allocations,
    }),
    [requestId, props.supplierId, kind, amount, method, date, allocations],
  );

  useEffect(() => {
    if (amount === null) return;
    let live = true;
    const timer = setTimeout(() => {
      void callApi<PaymentPlan>("/api/payables/payments/preview", {
        method: "POST",
        body,
      }).then((result) => {
        if (!live) return;
        if (result.ok) {
          setPlan(result.data);
          setError(null);
        } else {
          setPlan(null);
          setError(result.error);
        }
      });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [body, amount]);

  async function submit() {
    if (amount === null) {
      setError(PAYABLE_MESSAGES.amount);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await callApi("/api/payables/payments", {
      method: "POST",
      body,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAmountText("");
    setNamed({});
    setManual(false);
    setPlan(null);
    setRequestId(newRequestId());
    router.refresh();
  }

  // A plan only shows for an amount (stale ones are hidden).
  const shown = amount !== null ? plan : null;
  const byId = new Map(props.payables.map((row) => [row.id, row]));

  return (
    <section
      aria-labelledby="payment-form-title"
      className="flex flex-col gap-4 rounded-lg border bg-card p-5"
    >
      <h2 id="payment-form-title" className="text-h2">
        Ghi phiếu chi · {props.supplierName}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payment-amount">Số tiền</Label>
          <NumericInput
            id="payment-amount"
            kind="money"
            className="text-right tabular-nums"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            onBlur={() => {
              if (amount !== null)
                setAmountText(amount.toLocaleString("vi-VN"));
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payment-date">Ngày chi</Label>
          <DateInput
            id="payment-date"
            value={date}
            onValueChange={setDate}
            max={props.today}
          />
        </div>
      </div>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="sr-only">Hình thức</legend>
        {(
          [
            ["TRANSFER", "Chuyển khoản"],
            ["CASH", "Tiền mặt"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="payment-method"
              checked={method === value}
              onChange={() => setMethod(value)}
              className="accent-primary"
            />
            {label}
          </label>
        ))}
      </fieldset>
      {method === "TRANSFER" && props.bankRef ? (
        <p className="text-sm text-muted-foreground">
          Chuyển vào: {props.bankRef}
        </p>
      ) : null}
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="sr-only">Loại phiếu chi</legend>
        {(
          [
            ["PAYMENT", "Trả tiền hàng"],
            ["ADVANCE", "Ứng trước"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="payment-kind"
              checked={kind === value}
              onChange={() => setKind(value)}
              className="accent-primary"
            />
            {label}
          </label>
        ))}
      </fieldset>

      {kind === "PAYMENT" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-label">
              {manual
                ? "Chọn khoản khác"
                : "Tự trừ khoản đến hạn sớm nhất trước"}
            </span>
            <Button
              type="button"
              variant="link"
              className="h-auto p-0"
              disabled={props.payables.length === 0}
              onClick={() => setManual(!manual)}
            >
              {manual
                ? "Tự trừ khoản đến hạn sớm nhất trước"
                : "Chọn khoản khác"}
            </Button>
          </div>
          {manual ? (
            <ul className="flex flex-col gap-2">
              {props.payables.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-md bg-muted p-3 text-sm"
                >
                  <label htmlFor={`named-${row.id}`} className="flex flex-col">
                    <span className="font-medium">{row.code}</span>
                    <span className="text-caption text-muted-foreground">
                      Nhập {dayMonth(row.issuedDate)} · hạn{" "}
                      {dayMonth(row.dueDate)} · còn {money(row.remaining)}
                    </span>
                  </label>
                  <NumericInput
                    id={`named-${row.id}`}
                    kind="money"
                    className="w-36 text-right tabular-nums"
                    value={named[row.id] ?? ""}
                    onChange={(event) =>
                      setNamed({ ...named, [row.id]: event.target.value })
                    }
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {shown && shown.parts.length > 0 ? (
            <ul aria-label="Sẽ trừ vào" className="flex flex-col gap-2">
              {shown.parts.map((part) => (
                <li
                  key={part.goodsReceiptId}
                  className="flex items-center justify-between gap-3 rounded-md bg-muted p-3 text-sm"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{part.code}</span>
                    {byId.get(part.goodsReceiptId) ? (
                      <span className="text-caption text-muted-foreground">
                        Nhập{" "}
                        {dayMonth(
                          byId.get(part.goodsReceiptId)?.issuedDate ?? "",
                        )}{" "}
                        · hạn{" "}
                        {dayMonth(byId.get(part.goodsReceiptId)?.dueDate ?? "")}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="font-semibold tabular-nums">
                      {money(part.amount)}
                    </span>
                    <span
                      className={cn(
                        "text-caption",
                        part.left === 0
                          ? "text-success"
                          : "text-muted-foreground",
                      )}
                    >
                      {part.left === 0 ? "Hết nợ" : `Còn ${money(part.left)}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {shown && shown.advance > 0 && kind === "PAYMENT" ? (
        <p role="status" className="text-sm">
          Chi dư {money(shown.advance)} giữ làm tiền ứng trước, tự trừ vào phiếu
          nhập sau.
        </p>
      ) : (
        <p className="text-caption text-muted-foreground">
          Chi dư thì phần dư thành tiền ứng trước, tự trừ vào phiếu nhập sau của
          người bán này.
        </p>
      )}

      <FormError message={error} />
      <Button disabled={busy || amount === null} onClick={() => void submit()}>
        <CheckIcon aria-hidden /> Ghi phiếu chi
        {amount !== null ? ` ${money(amount)}` : ""}
      </Button>
      {shown ? (
        <p className="text-caption text-muted-foreground">
          {shown.owedAfter === 0
            ? `Sau khi ghi, ${props.supplierName} hết nợ.`
            : `Sau khi ghi, ${props.supplierName} còn phải trả ${money(shown.owedAfter)}.`}
        </p>
      ) : null}
    </section>
  );
}
