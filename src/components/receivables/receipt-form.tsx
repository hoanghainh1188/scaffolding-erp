"use client";

// "Ghi nhận thu tiền" of D14 (customer-receipts spec): a payment settles the
// earliest due debts first or the ones the customer named (0.2 #19), the
// rest becomes prepayment (0.2 #82); a cash deposit belongs to one contract
// (0.2 #88). The server previews the split and records it with the same
// rules; the form never computes money itself.
import { CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { FormError } from "@/components/catalog/form-error";
import { DateInput } from "@/components/domain/date-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { parseMoney } from "@/domain/money";
import type { ReceiptKind } from "@/domain/receivables";
import { callApi } from "@/lib/api-client";
import type { ReceiptPlan } from "@/lib/receivables/receipts";
import { cn } from "@/lib/utils";

import { dayMonth, money } from "./format";
import { NumericInput } from "@/components/domain/numeric-input";

export interface OpenDebtOption {
  key: string;
  label: string;
  kindLabel: string;
  dueDate: string;
  remaining: number;
}

export interface DepositOption {
  contractId: string;
  code: string;
  /** Agreed minus received: the most a deposit receipt may take. */
  room: number;
}

interface ReceiptFormProps {
  customerId: string;
  customerName: string;
  today: string;
  debts: readonly OpenDebtOption[];
  depositContracts: readonly DepositOption[];
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

export function ReceiptForm(props: ReceiptFormProps) {
  const router = useRouter();
  const [requestId, setRequestId] = useState(newRequestId);
  const [amountText, setAmountText] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [date, setDate] = useState(props.today);
  const [method, setMethod] = useState<"TRANSFER" | "CASH">("TRANSFER");
  const [kind, setKind] = useState<ReceiptKind>("PAYMENT");
  const [contractId, setContractId] = useState(
    props.depositContracts[0]?.contractId ?? "",
  );
  const [manual, setManual] = useState(false);
  const [named, setNamed] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<ReceiptPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amount = readAmount(amountText);
  const allocations = useMemo(
    () =>
      manual
        ? props.debts
            .map((debt) => ({
              debtKey: debt.key,
              amount: readAmount(named[debt.key] ?? "") ?? 0,
              seen: debt.remaining,
            }))
            .filter((part) => part.amount > 0)
        : [],
    [manual, named, props.debts],
  );
  const body = useMemo(
    () => ({
      requestId,
      customerId: props.customerId,
      kind,
      contractId: kind === "DEPOSIT" ? contractId : null,
      amount: amount ?? 0,
      method,
      receivedDate: date,
      allocations: kind === "PAYMENT" ? allocations : [],
    }),
    [
      requestId,
      props.customerId,
      kind,
      contractId,
      amount,
      method,
      date,
      allocations,
    ],
  );

  useEffect(() => {
    if (kind !== "PAYMENT" || amount === null) return;
    let live = true;
    const timer = setTimeout(() => {
      void callApi<ReceiptPlan>("/api/receivables/receipts/preview", {
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
  }, [body, kind, amount]);

  async function submit() {
    if (amount === null) {
      setError("Số tiền phải lớn hơn 0 ₫.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await callApi("/api/receivables/receipts", {
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

  // A plan only shows for a payment with an amount (stale ones are hidden).
  const shown = kind === "PAYMENT" && amount !== null ? plan : null;
  const byKey = new Map(props.debts.map((debt) => [debt.key, debt]));
  const deposit = props.depositContracts.find(
    (entry) => entry.contractId === contractId,
  );

  return (
    <section
      aria-labelledby="receipt-form-title"
      className="flex flex-col gap-4 rounded-lg border bg-card p-5"
    >
      <h2 id="receipt-form-title" className="text-h2">
        Ghi nhận thu tiền · {props.customerName}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="receipt-amount" required>
            Số tiền
          </Label>
          <NumericInput
            id="receipt-amount"
            kind="money"
            className="text-right tabular-nums"
            value={amountText}
            aria-invalid={Boolean(amountError)}
            onChange={(event) => {
              setAmountText(event.target.value);
              if (amountError && readAmount(event.target.value) !== null) {
                setAmountError(null);
              }
            }}
            onBlur={() => {
              if (amount !== null) {
                setAmountText(amount.toLocaleString("vi-VN"));
                setAmountError(null);
              } else {
                setAmountError("Số tiền phải lớn hơn 0 ₫.");
              }
            }}
          />
          {amountError && error !== amountError ? (
            <p className="text-caption text-destructive">{amountError}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="receipt-date" required>
            Ngày thu
          </Label>
          <DateInput
            id="receipt-date"
            value={date}
            required
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
              name="receipt-method"
              checked={method === value}
              onChange={() => setMethod(value)}
              className="accent-primary"
            />
            {label}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="sr-only">Loại phiếu thu</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="receipt-kind"
            checked={kind === "PAYMENT"}
            onChange={() => setKind("PAYMENT")}
            className="accent-primary"
          />
          Trả nợ
        </label>
        <label
          className={cn(
            "flex items-center gap-2",
            props.depositContracts.length === 0 && "text-muted-foreground",
          )}
        >
          <input
            type="radio"
            name="receipt-kind"
            checked={kind === "DEPOSIT"}
            disabled={props.depositContracts.length === 0}
            onChange={() => setKind("DEPOSIT")}
            className="accent-primary"
          />
          Nộp cọc tiền
        </label>
      </fieldset>

      {kind === "DEPOSIT" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="receipt-contract" required>
            Cọc của hợp đồng
          </Label>
          <select
            id="receipt-contract"
            value={contractId}
            onChange={(event) => setContractId(event.target.value)}
            className="h-10 rounded-md border bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          >
            {props.depositContracts.map((entry) => (
              <option key={entry.contractId} value={entry.contractId}>
                {entry.code}
              </option>
            ))}
          </select>
          {deposit ? (
            <p className="text-caption text-muted-foreground">
              Còn nhận tối đa {money(deposit.room)}. Cọc giữ riêng, không trừ
              vào nợ.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-label">
              {manual
                ? "Khách chỉ định khoản khác"
                : "Tự trừ khoản đến hạn sớm nhất trước"}
            </span>
            <Button
              type="button"
              variant="link"
              className="h-auto p-0"
              onClick={() => setManual(!manual)}
            >
              {manual
                ? "Tự trừ khoản đến hạn sớm nhất trước"
                : "Khách chỉ định khoản khác"}
            </Button>
          </div>
          {manual ? (
            <ul className="flex flex-col gap-2">
              {props.debts.map((debt) => (
                <li
                  key={debt.key}
                  className="flex items-center justify-between gap-3 rounded-md bg-muted p-3 text-sm"
                >
                  <label
                    htmlFor={`named-${debt.key}`}
                    className="flex flex-col"
                  >
                    <span className="font-medium">{debt.label}</span>
                    <span className="text-caption text-muted-foreground">
                      {debt.kindLabel} · hạn {dayMonth(debt.dueDate)} · còn{" "}
                      {money(debt.remaining)}
                    </span>
                  </label>
                  <NumericInput
                    id={`named-${debt.key}`}
                    kind="money"
                    className="w-36 text-right tabular-nums"
                    value={named[debt.key] ?? ""}
                    onChange={(event) =>
                      setNamed({ ...named, [debt.key]: event.target.value })
                    }
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {shown && shown.lines.length > 0 ? (
            <ul aria-label="Sẽ trừ vào" className="flex flex-col gap-2">
              {shown.lines.map((line) => (
                <li
                  key={line.debtKey}
                  className="flex items-center justify-between gap-3 rounded-md bg-muted p-3 text-sm"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{line.label}</span>
                    {byKey.get(line.debtKey) ? (
                      <span className="text-caption text-muted-foreground">
                        {byKey.get(line.debtKey)?.kindLabel} · hạn{" "}
                        {dayMonth(byKey.get(line.debtKey)?.dueDate ?? "")}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="font-semibold tabular-nums">
                      {money(line.amount)}
                    </span>
                    <span
                      className={cn(
                        "text-caption",
                        line.left === 0
                          ? "text-success"
                          : "text-muted-foreground",
                      )}
                    >
                      {line.left === 0 ? "Hết nợ" : `Còn ${money(line.left)}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {shown && shown.prepaid > 0 ? (
            <p role="status" className="text-sm">
              Trả dư {money(shown.prepaid)} giữ làm tiền trả trước, tự trừ vào
              khoản phát sinh sau.
            </p>
          ) : (
            <p className="text-caption text-muted-foreground">
              Trả dư thì phần dư giữ làm tiền trả trước, tự trừ vào khoản phát
              sinh sau.
            </p>
          )}
        </div>
      )}

      <FormError message={error} />
      <Button disabled={busy || amount === null} onClick={() => void submit()}>
        <CheckIcon aria-hidden /> Ghi phiếu thu
        {amount !== null ? ` ${money(amount)}` : ""}
      </Button>
      {shown ? (
        <p className="text-caption text-muted-foreground">
          Sau khi ghi, {props.customerName} còn nợ {money(shown.owedAfter)}.
        </p>
      ) : null}
    </section>
  );
}
