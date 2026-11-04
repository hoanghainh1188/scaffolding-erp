// "Hợp đồng thuê trong kỳ" of D7: one card per rental contract with its
// amount and whether the month is closed.
import Link from "next/link";

import { ToneBadge } from "@/components/domain/tone-badge";
import { formatMoney, toMoney } from "@/domain/money";
import type { PeriodContract } from "@/lib/billing/queries";
import { cn } from "@/lib/utils";

interface PeriodContractsProps {
  month: string;
  contracts: readonly PeriodContract[];
  closedCount: number;
  selectedId: string | null;
}

export function PeriodContracts(props: PeriodContractsProps) {
  return (
    <section aria-labelledby="period-contracts" className="flex flex-col gap-3">
      <h2 id="period-contracts" className="text-h2">
        Hợp đồng thuê trong kỳ{" "}
        <span className="text-muted-foreground">
          · {props.closedCount}/{props.contracts.length} đã chốt
        </span>
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {props.contracts.map((entry) => {
          const selected = entry.id === props.selectedId;
          return (
            <li key={entry.id}>
              <Link
                href={`/receivables/billing?month=${props.month}&contract=${entry.id}`}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex h-full flex-col gap-1 rounded-lg border bg-card p-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  selected && "border-primary bg-accent",
                )}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="text-label break-all">{entry.code}</span>
                  <ToneBadge tone={entry.closed ? "success" : "muted"}>
                    {entry.closed ? "Đã chốt" : "Chưa chốt"}
                  </ToneBadge>
                </span>
                <span className="text-sm text-muted-foreground">
                  {entry.customerName} · {entry.siteName}
                </span>
                <span className="font-medium tabular-nums" data-mask>
                  {formatMoney(toMoney(entry.totalAmount))}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
