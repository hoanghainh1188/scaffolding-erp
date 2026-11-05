// "Cọc và bảo lãnh" of D14 (receivables spec "Cọc và bảo lãnh trên D14").
import Link from "next/link";

import { ToneBadge } from "@/components/domain/tone-badge";
import { formatBusinessDate } from "@/domain/business-date";
import type { ContractDepositView } from "@/lib/receivables/queries";

import { dayMonth, money } from "./format";

function depositState(view: ContractDepositView) {
  if (view.state === "FULL")
    return { tone: "success" as const, label: "Đã nhận" };
  if (view.state === "SHORT") {
    return {
      tone: "warning" as const,
      label: `Còn thiếu ${money(view.agreed - view.received)}`,
    };
  }
  return { tone: "muted" as const, label: "Chưa nhận" };
}

interface DepositPanelProps {
  deposits: readonly ContractDepositView[];
  canSettle: boolean;
}

export function DepositPanel(props: DepositPanelProps) {
  const settleable = (view: ContractDepositView) =>
    props.canSettle && view.status === "ACTIVE";
  const shown = props.deposits.filter(
    (view) =>
      view.state !== "NO_DEPOSIT" ||
      view.guarantees.length > 0 ||
      settleable(view),
  );
  return (
    <section
      aria-labelledby="deposits-title"
      className="flex flex-col gap-3 rounded-lg border bg-card p-5"
    >
      <h2 id="deposits-title" className="text-h2">
        Cọc và bảo lãnh
      </h2>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Các hợp đồng đang chạy không có cọc hay bảo lãnh.
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {shown.map((view) => {
          const state = depositState(view);
          const first = view.receipts[0];
          return (
            <li key={view.contractId} className="flex flex-col gap-2">
              {view.state === "NO_DEPOSIT" && settleable(view) ? (
                <div className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
                  <span>
                    <span className="text-label">{view.contractCode}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · không có cọc tiền
                    </span>
                  </span>
                  <Link
                    href={`/receivables/contracts/${view.contractId}/close`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Thanh lý hợp đồng
                  </Link>
                </div>
              ) : null}
              {view.state !== "NO_DEPOSIT" ? (
                <div className="flex flex-col gap-1 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-label">{view.contractCode}</span>
                    <ToneBadge tone={state.tone}>{state.label}</ToneBadge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Cọc tiền</span>
                    <span className="font-semibold tabular-nums">
                      {money(view.agreed)}
                    </span>
                  </div>
                  <p className="text-caption text-muted-foreground">
                    {view.received > 0
                      ? `Đã nhận ${money(view.received)}${first ? ` · ${dayMonth(first.receivedDate)} (${view.receipts.map((r) => r.code).join(", ")})` : ""}`
                      : "Chưa nhận phiếu cọc nào"}
                  </p>
                  {settleable(view) ? (
                    <Link
                      href={`/receivables/contracts/${view.contractId}/close`}
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Thanh lý hợp đồng
                    </Link>
                  ) : null}
                </div>
              ) : null}
              {view.guarantees.map((guarantee) => (
                <div
                  key={guarantee.guaranteeNumber}
                  className="flex flex-col gap-1 rounded-md border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-label">{view.contractCode}</span>
                    {guarantee.warning ? (
                      <ToneBadge
                        tone={
                          guarantee.daysLeft < 0 ? "destructive" : "warning"
                        }
                        data-mask
                      >
                        {guarantee.daysLeft < 0
                          ? "Đã hết hạn"
                          : `Còn ${guarantee.daysLeft} ngày`}
                      </ToneBadge>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Bảo lãnh ngân hàng</span>
                    <span className="font-semibold tabular-nums">
                      {money(guarantee.amount)}
                    </span>
                  </div>
                  <p className="text-caption text-muted-foreground">
                    {guarantee.bankName} · chứng thư {guarantee.guaranteeNumber}{" "}
                    · hết hạn {formatBusinessDate(guarantee.expiryDate)}
                  </p>
                </div>
              ))}
            </li>
          );
        })}
      </ul>
      <p className="text-caption text-muted-foreground">
        Cọc giữ riêng từng hợp đồng. Chỉ cấn trừ khi thanh lý, cọc thừa thì hoàn
        lại khách.
      </p>
    </section>
  );
}
