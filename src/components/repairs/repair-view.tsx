// D12 read only: a posted slip (figures from the ledger) or a draft seen
// by someone without repairs.manage (figures from today's averages).
import { formatBusinessDate, formatDateTime } from "@/domain/business-date";
import { formatMoney, toMoney } from "@/domain/money";
import {
  formatQuantity,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import { repairTotals } from "@/domain/repair-order";
import type { AwaitingRepair, RepairDetail } from "@/lib/repairs/queries";

import { CostBlock } from "./cost-block";
import { postedLine, previewLine, type LineFigures } from "./preview";
import { RepairStatusBadge } from "./repair-status-badge";
import { RepairSummary } from "./repair-summary";

const units = (milli: number, unit: QuantityUnit) =>
  formatQuantity(toQuantity(milli, unit));

function figuresOf(
  slip: RepairDetail,
  awaiting: AwaitingRepair | null,
): (LineFigures | string)[] {
  if (slip.status === "POSTED") {
    return slip.lines.map((line) =>
      postedLine(
        line,
        slip.posted.find((posted) => posted.itemId === line.itemId),
        slip.scrapPriceUsed,
      ),
    );
  }
  const facts = new Map(awaiting?.items.map((item) => [item.itemId, item]));
  return slip.lines.map((line) => {
    const preview = previewLine(
      {
        itemCode: line.itemCode,
        itemName: line.itemName,
        unit: line.unit,
        goodMilli: line.goodMilli,
        scrapMilli: line.scrapMilli,
        repairCost: line.repairCost,
      },
      facts.get(line.itemId),
      awaiting?.scrapPricePerKg ?? null,
    );
    return preview.ok ? preview.figures : `${line.itemName}: ${preview.reason}`;
  });
}

interface RepairViewProps {
  slip: RepairDetail;
  /** Today's averages, for a draft only. */
  awaiting: AwaitingRepair | null;
}

export function RepairView({ slip, awaiting }: RepairViewProps) {
  const totals = repairTotals(slip.lines);
  const figures = figuresOf(slip, awaiting);
  const loss = toMoney(
    figures.reduce(
      (sum, item) => sum + (typeof item === "string" ? 0 : item.loss),
      0,
    ),
  );
  const facts = [
    ["Ngày sửa xong", formatBusinessDate(slip.repairDate)],
    ["Người/tổ sửa", slip.repairedBy ?? "–"],
    ["Lấy hàng Chờ sửa tại", `${slip.fromName} · ${slip.fromCode}`],
    ["Nhập Tốt, Phế liệu về", `${slip.toName} · ${slip.toCode}`],
    ["Người lập", slip.createdByName],
    ...(slip.status === "POSTED"
      ? [
          [
            "Ghi sổ",
            `${slip.postedByName ?? ""} · ${slip.postedAt ? formatDateTime(slip.postedAt) : ""}`,
          ],
          [
            "Giá sắt vụn đã dùng",
            slip.scrapPriceUsed === null
              ? "Không có phế liệu"
              : `${formatMoney(slip.scrapPriceUsed)}/kg`,
          ],
        ]
      : []),
    ...(slip.note ? [["Ghi chú", slip.note]] : []),
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-h1">Phiếu sửa chữa {slip.code}</h1>
        <RepairStatusBadge status={slip.status} />
      </div>
      {slip.confirmedNote ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          {slip.confirmedNote}
        </p>
      ) : null}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section
          aria-labelledby="repair-head-title"
          className="flex flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="repair-head-title" className="font-display text-h2">
            Thông tin chung
          </h2>
          <dl className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-2">
            {facts.map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-caption text-muted-foreground">
            Sổ kho ghi theo ngày ghi sổ.
          </p>
        </section>
        <RepairSummary
          cost={totals.cost}
          good={totals.good}
          scrap={totals.scrap}
          loss={loss}
        />
      </div>
      <section
        aria-labelledby="repair-lines-title"
        className="flex flex-col gap-4 rounded-lg border bg-card p-5"
      >
        <h2 id="repair-lines-title" className="font-display text-h2">
          Hàng đem sửa
        </h2>
        <div className="relative overflow-x-auto rounded-md border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted text-left">
              <tr>
                {[
                  "Hàng",
                  "Lấy ra sửa",
                  "Sửa xong → Tốt",
                  "Hỏng hẳn → Phế liệu",
                  "Chi phí sửa",
                ].map((label, index) => (
                  <th
                    key={label}
                    scope="col"
                    className={`border-b px-3 py-2.5 font-semibold ${index > 0 ? "text-right" : ""}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slip.lines.map((line) => (
                <tr key={line.itemId} className="bg-card">
                  <th
                    scope="row"
                    className="border-b px-3 py-2.5 text-left font-normal"
                  >
                    <span className="block font-semibold">{line.itemName}</span>
                    <span className="text-caption text-muted-foreground">
                      {line.itemCode}
                    </span>
                  </th>
                  <td className="border-b px-3 py-2.5 text-right tabular-nums">
                    {units(line.takenMilli, line.unit)}
                  </td>
                  <td className="border-b px-3 py-2.5 text-right tabular-nums">
                    {units(line.goodMilli, line.unit)}
                  </td>
                  <td className="border-b px-3 py-2.5 text-right tabular-nums">
                    {units(line.scrapMilli, line.unit)}
                  </td>
                  <td className="border-b px-3 py-2.5 text-right tabular-nums">
                    {formatMoney(line.repairCost)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-semibold">
                <th scope="row" colSpan={4} className="px-3 py-2.5 text-left">
                  Tổng chi phí sửa
                </th>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatMoney(totals.cost)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <section
        aria-labelledby="repair-cost-title"
        className="flex flex-col gap-4 rounded-lg border bg-card p-5"
      >
        <h2 id="repair-cost-title" className="font-display text-h2">
          Giá vốn sau sửa
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {figures.map((item, index) =>
            typeof item === "string" ? (
              <p key={index} className="rounded-md bg-muted px-3 py-2 text-sm">
                {item}
              </p>
            ) : (
              <CostBlock key={item.itemCode} figures={item} />
            ),
          )}
        </div>
        <p className="text-caption text-muted-foreground">
          {slip.status === "POSTED"
            ? "Số lấy từ sổ kho lúc ghi sổ."
            : "Số chính xác tính lúc ghi sổ."}
        </p>
      </section>
    </div>
  );
}
