// The four tiles of D14 (receivables spec "Màn D14 theo nhà thầu").
import type { BalanceTotals } from "@/lib/receivables/balances";
import { cn } from "@/lib/utils";

import { money } from "./format";

const names = (list: readonly string[]) =>
  list.length > 2
    ? `${list.slice(0, 2).join(", ")} và ${list.length - 2} nhà thầu khác`
    : list.join(", ");

export function SummaryTiles({ totals }: { totals: BalanceTotals }) {
  const tiles = [
    {
      label: "Tổng phải thu",
      value: totals.owed,
      note: `${totals.owingCount} nhà thầu đang nợ`,
      alert: false,
    },
    {
      label: "Nợ quá hạn",
      value: totals.overdue,
      note:
        totals.overdueCount > 0
          ? `${totals.overdueCount} nhà thầu · lâu nhất ${totals.longestOverdueDays} ngày`
          : "Không có",
      alert: totals.overdue > 0,
    },
    {
      label: "Đến hạn trong 7 ngày",
      value: totals.dueSoon,
      note: names(totals.dueSoonNames) || "Không có",
      alert: false,
    },
    {
      label: "Tiền trả trước đang giữ",
      value: totals.prepaid,
      note:
        totals.prepaid > 0
          ? `${names(totals.prepaidNames)} · tự trừ khoản sau`
          : "Không có",
      alert: false,
    },
  ];
  return (
    <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex flex-col gap-1 rounded-lg border bg-card p-4 shadow-xs"
        >
          <dt className="text-caption text-muted-foreground">{tile.label}</dt>
          <dd
            className={cn(
              "text-h2 tabular-nums",
              tile.alert && "text-destructive",
            )}
            data-mask
          >
            {money(tile.value)}
          </dd>
          <dd className="text-caption text-muted-foreground" data-mask>
            {tile.note}
          </dd>
        </div>
      ))}
    </dl>
  );
}
