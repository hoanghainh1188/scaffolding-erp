// D6 blocks (design D6-SiteDeliveries): goods on site, what is left to
// deliver, the "Cần kiểm tra" box and the timeline of batches.
import Link from "next/link";

import { formatBusinessDate, formatDateTime } from "@/domain/business-date";
import { CONDITION_LABELS } from "@/domain/condition";
import type { ContractType } from "@/domain/contract";
import type { ContractDeliveries } from "@/lib/deliveries/queries";

import { CompensationStatusBadge } from "@/components/compensations/compensation-badge";
import { BUY_BACK_STATUS_LABELS } from "@/domain/buy-back";
import { COMPENSATION_STATUS_LABELS } from "@/domain/compensation";
import { TRANSFER_STATUS_LABELS } from "@/domain/site-transfer";

import { DeliveryStatusBadge } from "./delivery-badges";
import { amountText, moneyText, numberText, totalsText } from "./format";

const head = "border-b px-3 py-2 font-semibold";
const cell = "border-b px-3 py-2";

type SiteRowView = ContractDeliveries["site"][number];

interface SiteColumn {
  label: string;
  value: (row: SiteRowView) => number;
}

/** Columns of D6; the site-operations ones only when a row has them. */
function siteColumns(rows: readonly SiteRowView[]): SiteColumn[] {
  const optional = (column: SiteColumn) =>
    rows.some((row) => column.value(row) !== 0) ? [column] : [];
  return [
    { label: "Đã xuất", value: (row) => row.deliveredMilli },
    ...optional({
      label: "Chuyển đến",
      value: (row) => row.transferredInMilli ?? 0,
    }),
    { label: "Đã trả", value: (row) => row.returnedMilli },
    ...optional({
      label: "Chuyển đi",
      value: (row) => row.transferredOutMilli ?? 0,
    }),
    ...optional({ label: "Mua lại", value: (row) => row.boughtMilli ?? 0 }),
    { label: "Mất", value: (row) => row.lostMilli },
  ];
}

/** "Hàng đang ở công trình": delivered, returned, on site, rent a day. */
export function SiteTable({ rows }: { rows: ContractDeliveries["site"] }) {
  const sum = (pick: (row: SiteRowView) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  const allPieces = rows.every((row) => row.unit === rows[0]?.unit);
  const unit = rows[0]?.unit ?? "PIECE";
  const columns = siteColumns(rows);
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted text-left">
          <tr>
            <th scope="col" className={head}>
              Hàng
            </th>
            {columns.map((column) => (
              <th
                key={column.label}
                scope="col"
                className={`${head} text-right`}
              >
                {column.label}
              </th>
            ))}
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
              {columns.map((column) => (
                <td
                  key={column.label}
                  className={`${cell} text-right tabular-nums`}
                >
                  {numberText(column.value(row), row.unit)}
                </td>
              ))}
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
              {columns.map((column) => (
                <td
                  key={column.label}
                  className="px-3 py-2 text-right tabular-nums"
                >
                  {numberText(sum(column.value), unit)}
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums">
                {amountText(
                  sum((row) => row.onSiteMilli),
                  unit,
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
            {check.kind === "RETURN"
              ? `${check.code} · ngày trả ${formatBusinessDate(check.businessDate)}, lưu trên máy ${formatBusinessDate(check.phoneDate)}`
              : `${check.code} · ngày giao ${formatBusinessDate(check.businessDate)}, xác nhận trên máy ${formatBusinessDate(check.phoneDate)}`}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        Điện thoại gửi muộn nên ngày giao, ngày trả là ngày gửi được. Kế toán
        xem lại khi tính tiền thuê.
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

type TimelineRow =
  | { kind: "DELIVERY"; entry: ContractDeliveries["timeline"][number] }
  | {
      kind: "RETURN";
      date: string;
      entry: ContractDeliveries["returns"][number];
    }
  | {
      kind: "TRANSFER";
      date: string;
      entry: ContractDeliveries["transfers"][number];
    }
  | {
      kind: "BUY_BACK";
      date: string;
      entry: ContractDeliveries["buyBacks"][number];
    };

type Dated = Exclude<TimelineRow, { kind: "DELIVERY" }>;

/** "Các đợt xuất và trả", newest first. */
export function DeliveryTimeline({
  entries,
  returns = [],
  transfers = [],
  buyBacks = [],
  exchanges = [],
}: {
  entries: ContractDeliveries["timeline"];
  returns?: ContractDeliveries["returns"];
  transfers?: ContractDeliveries["transfers"];
  buyBacks?: ContractDeliveries["buyBacks"];
  exchanges?: ContractDeliveries["exchanges"];
}) {
  if (
    entries.length === 0 &&
    returns.length === 0 &&
    transfers.length === 0 &&
    buyBacks.length === 0
  ) {
    return (
      <p className="text-sm text-muted-foreground">
        Chưa có đợt xuất nào. Bấm &ldquo;Tạo đợt xuất&rdquo; để lập đợt đầu.
      </p>
    );
  }
  // Batches keep their order; every dated row goes before the first batch
  // of an earlier day (they all arrive newest first).
  const waiting: Dated[] = [
    ...returns.map((entry): Dated => ({
      kind: "RETURN",
      date: entry.businessDate,
      entry,
    })),
    ...transfers.map((entry): Dated => ({
      kind: "TRANSFER",
      date: entry.date,
      entry,
    })),
    ...buyBacks.map((entry): Dated => ({
      kind: "BUY_BACK",
      date: entry.date,
      entry,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const rows: TimelineRow[] = [];
  for (const entry of entries) {
    while (waiting[0] && entry.date !== null && waiting[0].date >= entry.date) {
      const next = waiting.shift();
      if (next) rows.push(next);
    }
    rows.push({ kind: "DELIVERY", entry });
  }
  rows.push(...waiting);
  const byDelivery = new Map(
    exchanges.map((link) => [link.deliveryNoteId, link]),
  );
  const byReturn = new Map(
    exchanges.flatMap((link) =>
      link.returnNoteId ? [[link.returnNoteId, link] as const] : [],
    ),
  );
  return (
    <ol className="flex flex-col">
      {rows.map((row) => {
        if (row.kind === "RETURN") {
          return (
            <ReturnRow
              key={row.entry.id}
              entry={row.entry}
              exchange={byReturn.get(row.entry.id) ?? null}
            />
          );
        }
        if (row.kind === "TRANSFER") {
          return <TransferRow key={row.entry.id} entry={row.entry} />;
        }
        if (row.kind === "BUY_BACK") {
          return <BuyBackRow key={row.entry.id} entry={row.entry} />;
        }
        return (
          <DeliveryRow
            key={row.entry.id}
            entry={row.entry}
            exchange={byDelivery.get(row.entry.id) ?? null}
          />
        );
      })}
    </ol>
  );
}

function ExchangeBadge() {
  return (
    <span className="rounded-sm bg-highlight px-1.5 py-0.5 text-caption text-highlight-foreground">
      Đổi hàng
    </span>
  );
}

function TransferRow({
  entry,
}: {
  entry: ContractDeliveries["transfers"][number];
}) {
  const verb = entry.direction === "OUT" ? "Chuyển đi" : "Chuyển đến";
  const arrow = entry.direction === "OUT" ? "→" : "←";
  return (
    <li className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-b py-3 last:border-b-0">
      <span data-mask className="text-sm text-muted-foreground tabular-nums">
        {formatBusinessDate(entry.date)}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <Link
            href={`/sales/site-transfers/${entry.code}`}
            className="font-medium text-primary hover:underline"
          >
            {verb} {entry.code}
          </Link>
          {entry.status !== "POSTED" ? (
            <span className="text-caption text-muted-foreground">
              {TRANSFER_STATUS_LABELS[entry.status]}
            </span>
          ) : null}
        </span>
        <span className="text-sm">
          {entry.text} {arrow} {entry.otherSite}
        </span>
      </div>
    </li>
  );
}

function BuyBackRow({
  entry,
}: {
  entry: ContractDeliveries["buyBacks"][number];
}) {
  return (
    <li className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-b py-3 last:border-b-0">
      <span data-mask className="text-sm text-muted-foreground tabular-nums">
        {formatBusinessDate(entry.date)}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          href={`/sales/buy-backs/${entry.code}`}
          className="font-medium text-primary hover:underline"
        >
          Mua lại {entry.code}
        </Link>
        <span className="text-sm">
          {BUY_BACK_STATUS_LABELS[entry.status]} · {entry.text} ·{" "}
          {moneyText(entry.total)}
        </span>
      </div>
    </li>
  );
}

function ReturnRow({
  entry,
  exchange,
}: {
  entry: ContractDeliveries["returns"][number];
  exchange: ContractDeliveries["exchanges"][number] | null;
}) {
  return (
    <li className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-b py-3 last:border-b-0">
      <span data-mask className="text-sm text-muted-foreground tabular-nums">
        {formatBusinessDate(entry.businessDate)}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <Link
            href={`/sales/returns/${entry.code}`}
            className="font-medium text-primary hover:underline"
          >
            Thu hồi {entry.code}
          </Link>
          {exchange ? (
            <>
              <ExchangeBadge />
              <Link
                href={`/sales/deliveries/${exchange.deliveryCode}`}
                className="text-caption text-primary hover:underline"
              >
                Đổi hàng · {exchange.deliveryCode}
              </Link>
            </>
          ) : null}
          {entry.compensation ? (
            <CompensationStatusBadge status={entry.compensation.status} />
          ) : null}
        </span>
        <span className="text-sm">
          {entry.text}
          {entry.compensation
            ? ` · Đền bù ${COMPENSATION_STATUS_LABELS[entry.compensation.status]}`
            : ""}
        </span>
        {entry.phoneDifferentDay ? (
          <span data-mask className="text-caption text-warning">
            Lưu trên máy lúc {formatDateTime(entry.phoneDifferentDay)}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function DeliveryRow({
  entry,
  exchange,
}: {
  entry: ContractDeliveries["timeline"][number];
  exchange: ContractDeliveries["exchanges"][number] | null;
}) {
  return (
    <li className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-b py-3 last:border-b-0">
      <span data-mask className="text-sm text-muted-foreground tabular-nums">
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
          {exchange ? <ExchangeBadge /> : null}
          {exchange?.returnCode ? (
            <Link
              href={`/sales/returns/${exchange.returnCode}`}
              className="text-caption text-primary hover:underline"
            >
              Thu hồi {exchange.returnCode}
            </Link>
          ) : null}
          {exchange?.status === "WAITING" ? (
            <span className="text-caption text-warning">
              Chờ thu hồi {exchange.expectedText}
            </span>
          ) : null}
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
  );
}
