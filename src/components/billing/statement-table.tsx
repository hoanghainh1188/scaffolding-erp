// "Chi tiết từng lượng hàng" of D7 and of the printed statement
// (rental-billing spec "Màn D7: bảng kê và phải thu", design D8).
import { ToneBadge } from "@/components/domain/tone-badge";
import { formatBusinessDate } from "@/domain/business-date";
import { formatMoney, toMoney } from "@/domain/money";
import type { Statement, StatementLine } from "@/domain/rental-billing";
import { cn } from "@/lib/utils";

import {
  adjustmentTitle,
  chipText,
  dayMonth,
  holidayText,
  quantityText,
  sourceText,
} from "./format";

interface StatementTableProps {
  statement: Statement;
  /** Extra cell per adjustment line (edit buttons on D7). */
  adjustmentActions?: (line: StatementLine) => React.ReactNode;
  dense?: boolean;
}

const money = (value: number | null) =>
  value === null ? "–" : formatMoney(toMoney(value));

function AdjustmentRow({
  line,
  actions,
}: {
  line: StatementLine;
  actions?: React.ReactNode;
}) {
  const adjustment = line.adjustment;
  if (!adjustment) return null;
  return (
    <tr className="border-b bg-muted/40 align-top">
      <td className="px-3 py-2" colSpan={7}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {adjustmentTitle(adjustment.refMonth)}
          </span>
          <ToneBadge tone="highlight">Điều chỉnh</ToneBadge>
        </div>
        <p className="text-caption text-muted-foreground">{sourceText(line)}</p>
      </td>
      <td
        className="px-3 py-2 text-right text-caption text-muted-foreground"
        data-mask
      >
        {adjustment.createdByName
          ? `${adjustment.createdByName} lập ${formatBusinessDate(adjustment.createdAt.toISOString().slice(0, 10)).slice(0, 5)}`
          : ""}
        {actions}
      </td>
      <td
        className="px-3 py-2 text-right font-medium whitespace-nowrap tabular-nums"
        data-mask
      >
        {money(line.amount)}
      </td>
    </tr>
  );
}

export function StatementTable({
  statement,
  adjustmentActions,
  dense,
}: StatementTableProps) {
  const cell = dense ? "px-2 py-1" : "px-3 py-2";
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">Chi tiết từng lượng hàng</caption>
      <thead className="bg-muted text-left text-caption text-muted-foreground">
        <tr>
          <th scope="col" className={cell}>
            Hàng
          </th>
          <th scope="col" className={cn(cell, "text-right")}>
            Số lượng
          </th>
          <th scope="col" className={cn(cell, "text-right")}>
            Từ
          </th>
          <th scope="col" className={cn(cell, "text-right")}>
            Đến
          </th>
          <th scope="col" className={cn(cell, "text-right")}>
            Ngày lịch
          </th>
          <th scope="col" className={cn(cell, "text-right")}>
            Trừ nghỉ
          </th>
          <th scope="col" className={cn(cell, "text-right")}>
            Ngày tính
          </th>
          <th scope="col" className={cn(cell, "text-right")}>
            Giá / ngày
          </th>
          <th scope="col" className={cn(cell, "text-right")}>
            Thành tiền
          </th>
        </tr>
      </thead>
      <tbody>
        {statement.lines.length === 0 ? (
          <tr>
            <td colSpan={9} className={cn(cell, "text-muted-foreground")}>
              Kỳ này hợp đồng không có hàng nào tính tiền thuê.
            </td>
          </tr>
        ) : null}
        {statement.lines.map((line, index) => {
          if (line.kind === "ADJUSTMENT") {
            return (
              <AdjustmentRow
                key={`adj-${line.adjustment?.id ?? index}`}
                line={line}
                actions={adjustmentActions?.(line)}
              />
            );
          }
          const chip = chipText(line);
          return (
            <tr
              key={index}
              className={cn(
                "border-b align-top",
                line.kind === "MINIMUM" && "bg-highlight/30",
              )}
            >
              <td className={cell}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{line.itemName}</span>
                  {chip ? (
                    <ToneBadge
                      tone={
                        line.kind === "MINIMUM"
                          ? "highlight"
                          : line.out?.kind === "LOSS"
                            ? "warning"
                            : "primary"
                      }
                    >
                      {chip}
                    </ToneBadge>
                  ) : null}
                </div>
                <p className="text-caption text-muted-foreground">
                  {sourceText(line)}
                </p>
              </td>
              <td className={cn(cell, "text-right tabular-nums")}>
                {quantityText(line.quantityMilli)}
              </td>
              <td className={cn(cell, "text-right tabular-nums")} data-mask>
                {dayMonth(line.fromDate)}
              </td>
              <td className={cn(cell, "text-right tabular-nums")} data-mask>
                {dayMonth(line.toDate)}
              </td>
              <td className={cn(cell, "text-right tabular-nums")} data-mask>
                {line.calendarDays ?? "–"}
              </td>
              <td
                className={cn(cell, "text-right text-warning tabular-nums")}
                data-mask
              >
                {line.kind === "MINIMUM" ? "–" : holidayText(line.holidayDays)}
              </td>
              <td
                className={cn(cell, "text-right font-medium tabular-nums")}
                data-mask
              >
                {line.chargedDays ?? "–"}
              </td>
              <td className={cn(cell, "text-right tabular-nums")}>
                {money(line.dailyPrice)}
              </td>
              <td
                className={cn(
                  cell,
                  "text-right font-medium whitespace-nowrap tabular-nums",
                )}
                data-mask
              >
                {money(line.amount)}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colSpan={8} className={cn(cell, "text-left")}>
            Cộng tiền thuê
          </th>
          <td
            className={cn(
              cell,
              "text-right font-display text-h2 whitespace-nowrap tabular-nums",
            )}
            data-mask
          >
            {money(statement.rentAmount + statement.adjustmentAmount)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
