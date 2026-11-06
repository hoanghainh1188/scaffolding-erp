// The four tiles of D14c (payables spec "Màn D14c theo người bán").
import { money } from "@/components/receivables/format";
import type { PayableTotals } from "@/lib/payables/balances";
import { cn } from "@/lib/utils";

/** One seller is named; more are counted. */
const who = (names: readonly string[]) =>
  names.length === 1 ? (names[0] ?? "") : `${names.length} người bán`;

export function PayableTiles({ totals }: { totals: PayableTotals }) {
  const tiles = [
    {
      label: "Tổng phải trả",
      value: totals.owed,
      note: `${totals.owingCount} người bán`,
      alert: false,
    },
    {
      label: "Quá hạn",
      value: totals.overdue,
      note:
        totals.overdueCount > 0
          ? `${totals.overdueCount} người bán · lâu nhất ${totals.longestOverdueDays} ngày`
          : "Không có",
      alert: totals.overdue > 0,
    },
    {
      label: "Đến hạn trong 7 ngày",
      value: totals.dueSoon,
      note: totals.dueSoonNames.length ? who(totals.dueSoonNames) : "Không có",
      alert: false,
    },
    {
      label: "Đã ứng trước",
      value: totals.advance,
      note: totals.advanceNames.length
        ? `${who(totals.advanceNames)} · tự trừ khi nhập`
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
