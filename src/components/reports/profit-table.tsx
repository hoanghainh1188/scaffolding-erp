// "Lợi nhuận gộp" of D15 (spec management-reports "Bảng lợi nhuận gộp ba
// cột"; 0.2 số 107, số 111–số 113, số 116): this period, the previous one and the
// year to date; revenue before VAT minus the cost and losses of the ledger.
import { Panel } from "@/components/dashboard/panel";
import { money } from "@/components/dashboard/format";
import {
  COST_CATEGORIES,
  COST_LABELS,
  marginText,
  REVENUE_LABELS,
  REVENUE_PARTS,
  type ProfitTotals,
} from "@/domain/gross-profit";
import type { Report } from "@/lib/reports/report";
import { cn } from "@/lib/utils";

const NUMBER = "px-3.5 py-2.5 text-right whitespace-nowrap tabular-nums";

function Row(props: {
  label: string;
  values: readonly string[];
  kind?: "head" | "total" | "part";
}) {
  return (
    <tr
      className={cn(
        "border-b",
        props.kind === "head" && "bg-background font-bold",
        props.kind === "total" && "bg-accent text-base font-bold",
      )}
    >
      <th
        scope="row"
        className={cn(
          "px-3.5 py-2.5 text-left",
          props.kind === "part" ? "pl-7 font-normal" : "font-bold",
        )}
      >
        {props.label}
      </th>
      {props.values.map((value, index) => (
        <td key={index} className={NUMBER}>
          {value}
        </td>
      ))}
    </tr>
  );
}

/** Cost total as it acts on profit: "− 141.640.000 ₫", a gain "+ 408.276 ₫". */
export const costText = (value: number): string => {
  if (value === 0) return money(0);
  return value > 0 ? `− ${money(value)}` : `+ ${money(-value)}`;
};
const minus = costText;

export function ProfitTable({ report }: { report: Report }) {
  const columns: readonly ProfitTotals[] = [
    report.current,
    report.previous,
    report.yearToDate,
  ];
  const headers = [
    report.label,
    report.previousLabel,
    `Năm ${report.year} (lũy kế)`,
  ];
  const each = (pick: (totals: ProfitTotals) => string) => columns.map(pick);
  return (
    <Panel
      id="pl"
      title="Lợi nhuận gộp"
      note={
        <>
          Chi phí sửa đã chi trong kỳ: {money(report.current.repairSpent)} (
          {report.previousLabel.toLowerCase()}:{" "}
          {money(report.previous.repairSpent)}; lũy kế năm:{" "}
          {money(report.yearToDate.repairSpent)}), đã cộng vào giá hàng Tốt, vào
          lợi nhuận khi hàng đó rời kho. Công sản xuất đã chi trong kỳ:{" "}
          {money(report.current.productionSpent)} (
          {report.previousLabel.toLowerCase()}:{" "}
          {money(report.previous.productionSpent)}; lũy kế năm:{" "}
          {money(report.yearToDate.productionSpent)}), đã cộng vào giá thành
          phẩm. Hàng cho thuê không trừ khấu hao. Chưa gồm chi phí ngoài sổ kho
          (xe, nhân công…). Hàng mất tính theo ngày trả, đền bù theo ngày duyệt.
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-label font-normal">
          <thead>
            <tr className="border-b text-caption text-muted-foreground">
              <th scope="col" className="px-3.5 py-2.5 text-left font-semibold">
                Khoản mục
              </th>
              {headers.map((header, index) => (
                <th
                  key={header}
                  scope="col"
                  className="px-3.5 py-2.5 text-right font-semibold"
                >
                  {header}
                  {columns[index]?.provisional ? (
                    <span className="block font-normal">tạm tính</span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row
              kind="head"
              label="Doanh thu (chưa VAT)"
              values={each((t) => money(t.revenueTotal))}
            />
            {REVENUE_PARTS.map((part) => (
              <Row
                key={part}
                kind="part"
                label={REVENUE_LABELS[part]}
                values={each((t) => money(t.revenue[part]))}
              />
            ))}
            <Row
              kind="head"
              label="Giá vốn và hao hụt"
              values={each((t) => minus(t.costTotal))}
            />
            {COST_CATEGORIES.map((category) => (
              <Row
                key={category}
                kind="part"
                label={COST_LABELS[category]}
                values={each((t) => money(t.costs[category]))}
              />
            ))}
            <Row
              kind="total"
              label="Lợi nhuận gộp"
              values={each((t) => money(t.profit))}
            />
            <Row
              label="Tỷ suất lợi nhuận gộp"
              values={each((t) => marginText(t.profit, t.revenueTotal))}
            />
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
