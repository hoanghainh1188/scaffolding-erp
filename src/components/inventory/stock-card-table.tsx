import Link from "next/link";

import { ToneBadge } from "@/components/domain/tone-badge";
import { formatBusinessDate } from "@/domain/business-date";
import type { StockCard } from "@/lib/inventory/card";
import { cn } from "@/lib/utils";

import { formatCost, formatStock } from "./format";

interface StockCardTableProps {
  card: StockCard;
  from: string;
  priced: boolean;
}

const th = "border-b px-3 py-2.5 font-semibold";
const td = "border-b px-3 py-2.5";
const num = "text-right whitespace-nowrap tabular-nums";

const shortDate = (value: string) => formatBusinessDate(value).slice(0, 5);

/** D11 "Sổ kho trong kỳ": opening row, each ledger line, period totals. */
export function StockCardTable({ card, from, priced }: StockCardTableProps) {
  const unit = card.item.unit;
  return (
    <div className="relative overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm tabular-nums">
        <thead className="bg-muted">
          <tr>
            <th scope="col" className={cn(th, "text-left")}>
              Ngày
            </th>
            <th scope="col" className={cn(th, "text-left")}>
              Chứng từ
            </th>
            <th scope="col" className={cn(th, "text-left")}>
              Diễn giải
            </th>
            <th scope="col" className={cn(th, num)}>
              Nhập
            </th>
            <th scope="col" className={cn(th, num)}>
              Xuất
            </th>
            <th scope="col" className={cn(th, num)}>
              Tồn
            </th>
            {priced ? (
              <>
                <th scope="col" className={cn(th, num)}>
                  Đơn giá ghi sổ
                </th>
                <th scope="col" className={cn(th, num)}>
                  Giá vốn BQ sau
                </th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          <tr className="bg-muted/60">
            <th scope="row" className={cn(td, "text-left font-medium")}>
              {shortDate(from)}
            </th>
            <td className={cn(td, "text-muted-foreground")}>–</td>
            <td className={cn(td, "font-semibold")}>Tồn đầu kỳ</td>
            <td className={td} />
            <td className={td} />
            <td className={cn(td, num, "font-semibold")}>
              {formatStock(card.opening, unit)}
            </td>
            {priced ? (
              <>
                <td className={cn(td, num, "text-muted-foreground")}>–</td>
                <td className={cn(td, num)}>{formatCost(card.openingAvg)}</td>
              </>
            ) : null}
          </tr>
          {card.lines.map((line) => {
            const adjustment =
              line.documentType === "ADJUSTMENT" ||
              line.documentType === "OPENING" ||
              line.documentType === "REVALUE";
            return (
              <tr key={line.id} className="bg-card hover:bg-muted">
                <th scope="row" className={cn(td, "text-left font-medium")}>
                  {shortDate(line.date)}
                </th>
                <td className={cn(td, "whitespace-nowrap")}>
                  {adjustment && line.documentId ? (
                    <Link
                      href={`/inventory/adjustments/${line.documentId}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {line.documentCode}
                    </Link>
                  ) : (
                    <span className="font-medium">{line.documentCode}</span>
                  )}
                  {line.documentType === "ADJUSTMENT" ? (
                    <ToneBadge tone="warning" className="ml-2">
                      Điều chỉnh
                    </ToneBadge>
                  ) : null}
                  {line.documentType === "REVALUE" ? (
                    <ToneBadge tone="warning" className="ml-2">
                      Điều chỉnh giá
                    </ToneBadge>
                  ) : null}
                </td>
                <td className={td}>{line.description}</td>
                <td className={cn(td, num)}>
                  {line.in ? formatStock(line.in, unit) : ""}
                </td>
                <td className={cn(td, num)}>
                  {line.out ? formatStock(line.out, unit) : ""}
                </td>
                <td className={cn(td, num, "font-semibold")}>
                  {formatStock(line.balance, unit)}
                </td>
                {priced ? (
                  <>
                    <td className={cn(td, num)}>
                      {line.movement === "REVALUE"
                        ? ""
                        : formatCost(line.unitCost)}
                    </td>
                    <td className={cn(td, num)}>{formatCost(line.avgAfter)}</td>
                  </>
                ) : null}
              </tr>
            );
          })}
          {card.lines.length === 0 ? (
            <tr>
              <td
                colSpan={priced ? 8 : 6}
                className={cn(td, "text-center text-muted-foreground")}
              >
                Không có biến động trong kỳ
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot className="bg-muted font-semibold">
          <tr>
            <th scope="row" colSpan={3} className="px-3 py-2.5 text-left">
              Cộng phát sinh trong kỳ
            </th>
            <td className={cn("px-3 py-2.5", num)}>
              {formatStock(card.inflow, unit)}
            </td>
            <td className={cn("px-3 py-2.5", num)}>
              {formatStock(card.outflow, unit)}
            </td>
            <td className={cn("px-3 py-2.5", num)}>
              {formatStock(card.closing, unit)}
            </td>
            {priced ? (
              <>
                <td />
                <td className={cn("px-3 py-2.5", num)}>
                  {formatCost(card.currentAvg)}
                </td>
              </>
            ) : null}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
