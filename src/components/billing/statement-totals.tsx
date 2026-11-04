// "Cước vận chuyển trong kỳ" and "Phải thu kỳ" of D7 and the printout
// (rental-billing spec "Màn D7: bảng kê và phải thu", 0.2 #78, #79).
import { formatBusinessDate } from "@/domain/business-date";
import { formatMoney, toMoney } from "@/domain/money";
import { formatMonth, vatText, type Statement } from "@/domain/rental-billing";

import { dayMonth } from "./format";

const money = (value: number) => formatMoney(toMoney(value));

export function FreightTable({ statement }: { statement: Statement }) {
  if (statement.freight.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Kỳ này không có chuyến nào công ty gọi xe.
      </p>
    );
  }
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">Cước vận chuyển trong kỳ</caption>
      <thead className="bg-muted text-left text-caption text-muted-foreground">
        <tr>
          <th scope="col" className="px-3 py-2">
            Chuyến
          </th>
          <th scope="col" className="px-3 py-2 text-right">
            Ngày
          </th>
          <th scope="col" className="px-3 py-2 text-right">
            Cước
          </th>
        </tr>
      </thead>
      <tbody>
        {statement.freight.map((entry) => (
          <tr key={entry.deliveryNoteId} className="border-b">
            <td className="px-3 py-2">
              <span className="font-medium">
                {entry.code}
                {entry.batchNo ? ` · Đợt ${entry.batchNo}` : ""}
              </span>
              <p className="text-caption text-muted-foreground">
                {entry.vehiclePlate ? `Xe ${entry.vehiclePlate} · ` : ""}
                chiều đi
              </p>
            </td>
            <td className="px-3 py-2 text-right tabular-nums" data-mask>
              {dayMonth(entry.date)}
            </td>
            <td className="px-3 py-2 text-right font-medium tabular-nums">
              {money(entry.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AmountDue({ statement }: { statement: Statement }) {
  const rows: [string, number][] = [
    ["Tiền thuê", statement.rentAmount],
    ["Điều chỉnh kỳ trước", statement.adjustmentAmount],
    ["Cước vận chuyển", statement.freightAmount],
    ["Trước VAT", statement.beforeVat],
    ...statement.vat.map((group): [string, number] => [
      `VAT ${vatText(group.basisPoints)}`,
      group.amount,
    ]),
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="flex flex-col justify-between gap-2 rounded-lg bg-primary p-5 text-primary-foreground">
        <p className="text-label">
          Phải thu kỳ {formatMonth(statement.period.month)}
        </p>
        <p className="font-display text-h1 tabular-nums" data-mask>
          {money(statement.totalAmount)}
        </p>
        <p className="text-caption">
          {statement.running
            ? `Tạm tính đến ${formatBusinessDate(statement.asOf)}`
            : `Hạn trả ${formatBusinessDate(statement.dueDate)}`}
        </p>
      </div>
      <dl className="flex flex-col gap-1 rounded-lg border p-4 text-sm">
        <dt className="text-label">Cộng</dt>
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums" data-mask>
              {money(value)}
            </dd>
          </div>
        ))}
        <div className="mt-1 flex justify-between gap-4 border-t pt-2 font-medium">
          <dt>Phải thu</dt>
          <dd className="tabular-nums" data-mask>
            {money(statement.totalAmount)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
