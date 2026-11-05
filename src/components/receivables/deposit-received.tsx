// D5 "Tiền cọc": what was received by deposit receipts, the settlement of a
// closed contract, and the link to D14b (contracts spec "Cọc tiền và bảo
// lãnh ngân hàng", contract-settlement spec "Hợp đồng đã thanh lý bị khóa").
import Link from "next/link";

import { formatBusinessDate } from "@/domain/business-date";
import type { ContractMoneyStatus } from "@/lib/receivables/queries";

import { money } from "./format";

interface DepositReceivedProps {
  status: ContractMoneyStatus;
  agreed: number;
  settleHref: string | null;
}

export function DepositReceived({
  status,
  agreed,
  settleHref,
}: DepositReceivedProps) {
  const done = status.settlement;
  return (
    <div className="flex flex-col gap-1 text-sm">
      {agreed > 0 ? (
        <p>
          Cọc tiền {money(agreed)} · đã nhận {money(status.received)}
          {status.receiptCodes.length
            ? ` (${status.receiptCodes.join(", ")})`
            : ""}
          {status.received < agreed && !done
            ? ` · còn thiếu ${money(agreed - status.received)}`
            : ""}
        </p>
      ) : null}
      {done ? (
        <p>
          Đã thanh lý ngày {formatBusinessDate(done.settledDate)} · cấn trừ{" "}
          {money(status.received - done.refundAmount)} · hoàn lại{" "}
          {money(done.refundAmount)}
        </p>
      ) : null}
      {settleHref ? (
        <Link
          href={settleHref}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Thanh lý hợp đồng
        </Link>
      ) : null}
    </div>
  );
}
