import Link from "next/link";

import { ConditionBadge } from "@/components/domain/condition-badge";
import { signedMoney } from "@/domain/stock-revaluation";
import type { AdjustmentDetail } from "@/lib/inventory/adjustments";

import { formatCost } from "./format";

interface ValueAdjustmentLinesProps {
  adjustment: AdjustmentDetail;
}

/**
 * The lines of a value adjustment: change, average before → after (the
 * expected one at the numbers of now until it is posted) and the total
 * (spec stock-value-adjustments "Hiện trên trang Phiếu điều chỉnh").
 */
export function ValueAdjustmentLines({
  adjustment,
}: ValueAdjustmentLinesProps) {
  const th = "border-b px-3 py-2.5 text-left font-semibold";
  const td = "border-b px-3 py-2.5";
  const posted = new Map(
    adjustment.posted.map((row) => [`${row.itemCode}|${row.condition}`, row]),
  );
  const total = adjustment.lines.reduce(
    (sum, line) => sum + (line.valueDelta ?? 0),
    0,
  );
  const done = adjustment.status === "DONE";

  return (
    <section
      aria-labelledby="value-lines"
      className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="value-lines" className="font-display text-h2">
          Các dòng điều chỉnh giá
        </h2>
        {adjustment.sourceReceiptCode ? (
          <p className="text-sm">
            Chi phí chuyến{" "}
            {adjustment.sourceOrderCode ? (
              <Link
                href={`/purchasing/orders/${adjustment.sourceOrderCode}`}
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                {adjustment.sourceReceiptCode}
              </Link>
            ) : (
              <span className="font-semibold">
                {adjustment.sourceReceiptCode}
              </span>
            )}{" "}
            đã ghi{" "}
            <span className="tabular-nums">
              {formatCost(adjustment.recordedTripCost)}
            </span>{" "}
            → đúng{" "}
            <span className="font-semibold tabular-nums">
              {formatCost(adjustment.correctedTripCost)}
            </span>
          </p>
        ) : null}
      </div>
      {!done ? (
        <p className="text-sm text-muted-foreground">
          Giá BQ sau là số dự kiến theo tồn lúc xem; khi duyệt, hệ thống tính
          lại theo tồn lúc đó.
        </p>
      ) : null}
      <div className="relative overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead className="bg-muted">
            <tr>
              <th scope="col" className={th}>
                Vật tư
              </th>
              <th scope="col" className={th}>
                Tình trạng
              </th>
              <th scope="col" className={`${th} text-right`}>
                Chênh lệch
              </th>
              <th scope="col" className={`${th} text-right`}>
                Giá BQ trước
              </th>
              <th scope="col" className={`${th} text-right`}>
                {done ? "Giá BQ sau" : "Giá BQ sau (dự kiến)"}
              </th>
            </tr>
          </thead>
          <tbody>
            {adjustment.lines.map((line) => {
              const row = posted.get(`${line.itemCode}|${line.condition}`);
              const before = row ? row.avgBefore : line.preview?.avgCost;
              const after = row ? row.avgAfter : line.preview?.newAvg;
              return (
                <tr key={line.lineNo}>
                  <td className={td}>
                    <span className="font-semibold">{line.itemCode}</span> ·{" "}
                    {line.itemName}
                  </td>
                  <td className={td}>
                    <ConditionBadge condition={line.condition} />
                  </td>
                  <td className={`${td} text-right`}>
                    {signedMoney(line.valueDelta ?? 0)}
                  </td>
                  <td className={`${td} text-right`}>
                    {formatCost(before ?? null)}
                  </td>
                  <td className={`${td} text-right`}>
                    {line.preview?.error ? (
                      <span className="text-destructive">
                        {line.preview.error}
                      </span>
                    ) : (
                      formatCost(after ?? null)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-semibold">
              <th scope="row" colSpan={2} className={`${td} text-left`}>
                Tổng chênh lệch
              </th>
              <td className={`${td} text-right`}>{signedMoney(total)}</td>
              <td colSpan={2} className={td} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
