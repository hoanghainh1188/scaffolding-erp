// D6 blocks (design D6-SiteDeliveries): goods on site, what is left to
// deliver, the "Cần kiểm tra" box and the timeline of batches.
import Link from "next/link";

import { formatBusinessDate, formatDateTime } from "@/domain/business-date";
import { CONDITION_LABELS } from "@/domain/condition";
import type { ContractType } from "@/domain/contract";
import type { ContractDeliveries } from "@/lib/deliveries/queries";

import { DeliveryStatusBadge } from "./delivery-badges";
import { amountText, moneyText, numberText, totalsText } from "./format";

const head = "border-b px-3 py-2 font-semibold";
const cell = "border-b px-3 py-2";

/** "Hàng đang ở công trình": delivered, returned, on site, rent a day. */
export function SiteTable({ rows }: { rows: ContractDeliveries["site"] }) {
  const totals = new Map<string, number>();
  for (const row of rows)
    totals.set(row.unit, (totals.get(row.unit) ?? 0) + row.onSiteMilli);
  const sum = (pick: (row: (typeof rows)[number]) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  const allPieces = rows.every((row) => row.unit === rows[0]?.unit);
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted text-left">
          <tr>
            <th scope="col" className={head}>
              Hàng
            </th>
            <th scope="col" className={`${head} text-right`}>
              Đã xuất
            </th>
            <th scope="col" className={`${head} text-right`}>
              Đã trả
            </th>
            <th scope="col" className={`${head} text-right`}>
              Đang ở công trình
            </th>
            <th scope="col" className={`${head} text-right`}>
              Tiền 1 ngày
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.itemId}>
              <th scope="row" className={`${cell} text-left font-normal`}>
                {row.itemName}{" "}
                <span className="text-muted-foreground">· {row.itemCode}</span>
              </th>
              <td className={`${cell} text-right tabular-nums`}>
                {numberText(row.deliveredMilli, row.unit)}
              </td>
              <td className={`${cell} text-right tabular-nums`}>
                {numberText(row.returnedMilli, row.unit)}
              </td>
              <td className={`${cell} text-right font-medium tabular-nums`}>
                {amountText(row.onSiteMilli, row.unit)}
              </td>
              <td className={`${cell} text-right tabular-nums`}>
                {moneyText(row.dayRent)}
              </td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && allPieces ? (
          <tfoot>
            <tr className="font-semibold">
              <th scope="row" className="px-3 py-2 text-left">
                Cộng
              </th>
              <td className="px-3 py-2 text-right tabular-nums">
                {numberText(
                  sum((row) => row.deliveredMilli),
                  rows[0]?.unit ?? "PIECE",
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {numberText(
                  sum((row) => row.returnedMilli),
                  rows[0]?.unit ?? "PIECE",
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {amountText(
                  sum((row) => row.onSiteMilli),
                  rows[0]?.unit ?? "PIECE",
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {moneyText(sum((row) => row.dayRent))}
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/** Ô "Đang cho thuê 440 cái · 276.000 ₫ mỗi ngày". */
export function OnRentCard({ rows }: { rows: ContractDeliveries["site"] }) {
  const totals = new Map<string, number>();
  for (const row of rows)
    totals.set(row.unit, (totals.get(row.unit) ?? 0) + row.onSiteMilli);
  const rent = rows.reduce((sum, row) => sum + row.dayRent, 0);
  return (
    <section
      aria-labelledby="on-rent-title"
      className="flex flex-col gap-1 rounded-lg border bg-card p-5"
    >
      <h2 id="on-rent-title" className="text-label text-muted-foreground">
        Đang cho thuê
      </h2>
      <p className="text-h1 tabular-nums">
        {totalsText(
          [...totals.entries()].map(([unit, milli]) => ({
            unit: unit as (typeof rows)[number]["unit"],
            milli,
          })),
        )}
      </p>
      <p className="text-sm text-muted-foreground">
        {moneyText(rent)} mỗi ngày
      </p>
    </section>
  );
}

/** "Còn phải giao" of each contract line, with what is not on a note yet. */
export function RemainingTable({
  type,
  rows,
}: {
  type: ContractType;
  rows: ContractDeliveries["remaining"];
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted text-left">
          <tr>
            <th scope="col" className={head}>
              Hàng
            </th>
            <th scope="col" className={`${head} text-right`}>
              Trên hợp đồng
            </th>
            <th scope="col" className={`${head} text-right`}>
              {type === "RENTAL" ? "Đang ở công trình" : "Đã giao"}
            </th>
            <th scope="col" className={`${head} text-right`}>
              Còn phải giao
            </th>
            <th scope="col" className={`${head} text-right`}>
              Chưa lên phiếu
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className={`${cell} text-left font-normal`}>
                {row.itemName}{" "}
                <span className="text-muted-foreground">
                  · {row.line.itemCode}
                  {row.line.condition
                    ? ` · ${CONDITION_LABELS[row.line.condition]}`
                    : ""}
                </span>
              </th>
              <td className={`${cell} text-right tabular-nums`}>
                {numberText(row.contractMilli, row.unit)}
              </td>
              <td className={`${cell} text-right tabular-nums`}>
                {numberText(row.doneMilli, row.unit)}
              </td>
              <td className={`${cell} text-right font-medium tabular-nums`}>
                {amountText(row.remainingMilli, row.unit)}
                {row.overMilli > 0 ? (
                  <span className="block text-caption text-warning">
                    đã giao vượt {numberText(row.overMilli, row.unit)}
                  </span>
                ) : null}
              </td>
              <td className={`${cell} text-right tabular-nums`}>
                {numberText(row.unplannedMilli, row.unit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Cần kiểm tra": notes confirmed on the phone another day (0.2 #55). */
export function DeliveryChecks({
  checks,
}: {
  checks: ContractDeliveries["checks"];
}) {
  if (checks.length === 0) return null;
  return (
    <section
      aria-labelledby="checks-title"
      className="flex flex-col gap-2 rounded-lg border border-warning bg-card p-5 text-sm"
    >
      <h2 id="checks-title" className="text-label">
        Cần kiểm tra
      </h2>
      <ul className="flex flex-col gap-1">
        {checks.map((check) => (
          <li key={check.code} data-mask>
            {check.code} · ngày giao {formatBusinessDate(check.businessDate)},
            xác nhận trên máy {formatBusinessDate(check.phoneDate)}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        Điện thoại gửi muộn nên ngày giao là ngày gửi được. Kế toán xem lại khi
        tính tiền thuê.
      </p>
    </section>
  );
}

function entryText(entry: ContractDeliveries["timeline"][number]): string {
  if (entry.status === "POSTED") {
    const short = entry.short ? ` · xuất thiếu ${entry.short}` : "";
    return `Xuất ${entry.delivered}${short}`;
  }
  if (entry.status === "PICKING") {
    return `${entry.requested} · ${entry.pickingByName ?? "thủ kho"} đang nhặt hàng`;
  }
  if (entry.status === "CANCELLED") {
    return `${entry.requested} · đã hủy${entry.cancelledReason ? `: ${entry.cancelledReason}` : ""}`;
  }
  return `${entry.requested} · chờ thủ kho nhặt`;
}

/** "Các đợt xuất và trả", newest first. */
export function DeliveryTimeline({
  entries,
}: {
  entries: ContractDeliveries["timeline"];
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Chưa có đợt xuất nào. Bấm &ldquo;Tạo đợt xuất&rdquo; để lập đợt đầu.
      </p>
    );
  }
  return (
    <ol className="flex flex-col">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-b py-3 last:border-b-0"
        >
          <span
            data-mask
            className="text-sm text-muted-foreground tabular-nums"
          >
            {entry.date ? formatBusinessDate(entry.date) : "Chưa hẹn ngày"}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <Link
                href={`/sales/deliveries/${entry.code}`}
                className="font-medium text-primary hover:underline"
              >
                {entry.code} · Đợt {entry.batchNo}
              </Link>
              <DeliveryStatusBadge status={entry.status} />
            </span>
            <span className="text-sm">
              {entryText(entry)}
              {entry.companyTruck && entry.freightAmount !== null
                ? ` · cước ${moneyText(entry.freightAmount)}`
                : ""}
            </span>
            {entry.phoneDifferentDay ? (
              <span data-mask className="text-caption text-warning">
                Xác nhận trên máy lúc {formatDateTime(entry.phoneDifferentDay)}
              </span>
            ) : null}
            {entry.status === "PLANNED" && entry.returnedReason ? (
              <span className="text-caption text-warning">
                Trả lại: {entry.returnedReason}
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
