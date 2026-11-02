// The receiving part of D3b (spec purchase-orders "Phần nhận hàng trên
// D3b", goods-receipt design D10): what came in per line, the trips, and
// what the order still waits for.
import { ToneBadge } from "@/components/domain/tone-badge";
import { formatDateTime } from "@/domain/business-date";
import { formatMoney } from "@/domain/money";
import { hasStandardWeight } from "@/domain/quantity";
import type { OrderLineRow } from "@/lib/purchasing/queries";
import {
  orderReceivingSummary,
  type LineSummary,
  type ReceivingSummary,
} from "@/domain/receiving-summary";
import type { ReceiptView } from "@/lib/receiving/queries";
import type { Money } from "@/domain/money";

import { quantityText } from "../receiving/receipt-model";

const lowerFirst = (text: string) =>
  text.charAt(0).toLowerCase() + text.slice(1);

/** D3b numbers from the order lines (keyed by item code) and its trips. */
export function receivingOf(
  lines: readonly OrderLineRow[],
  trips: readonly ReceiptView[],
  expectedCosts: Money,
): ReceivingSummary {
  return orderReceivingSummary({
    lines: lines.map((line) => ({
      orderLineId: line.itemCode,
      itemUnit: line.itemUnit,
      lineUnit: line.unit,
      orderedMilli: line.quantity,
      unitPrice: line.unitPrice,
    })),
    receipts: trips.map((trip) => ({
      tripNo: trip.tripNo,
      lines: trip.lines.map((line) => ({
        ...line,
        orderLineId: line.itemCode,
      })),
      costs: trip.costs,
    })),
    expectedCosts,
  });
}

/** "40 mâm giàn giáo 1,6m" for every line still awaited. */
export function waitingOf(
  summary: ReceivingSummary,
  lines: readonly OrderLineRow[],
): string {
  return summary.waiting
    .map((wait) => {
      const line = lines.find((one) => one.itemCode === wait.orderLineId);
      if (!line) return "";
      const gap = quantityText(wait.gapMilli, line.unit).replace(/ cái$/, "");
      return `${gap} ${lowerFirst(line.itemName)}`;
    })
    .filter(Boolean)
    .join(", ");
}

/** The "Đã nhận" cell of a line once something came in. */
export function ReceivedCell({
  line,
  summary,
}: {
  line: OrderLineRow;
  summary: LineSummary | undefined;
}) {
  if (!summary || summary.state === "NONE") {
    return <>{line.received === null ? "–" : quantityText(0, line.unit)}</>;
  }
  const gap = quantityText(summary.gapMilli, line.unit);
  const shortGap = gap.replace(/ cái$/, "");
  return (
    <span className="flex flex-col items-end gap-1">
      <span>{quantityText(summary.receivedMilli, line.unit)}</span>
      {summary.state === "FULL" && (
        <span className="text-caption text-success">đủ</span>
      )}
      {summary.state === "SHORT_WAITING" && (
        <span className="flex items-center gap-1 text-caption">
          <span className="text-warning">thiếu {shortGap}</span>
          <ToneBadge tone="warning">Chờ giao bù</ToneBadge>
        </span>
      )}
      {summary.state === "SHORT_CLOSED" && (
        <span className="text-caption text-muted-foreground">
          thiếu {shortGap} · Không chờ
        </span>
      )}
      {summary.state === "OVER" && (
        <span className="flex items-center gap-1 text-caption">
          <ToneBadge tone="primary">Nhận dư</ToneBadge>
          <span>
            {hasStandardWeight(line.unit) ? "dư" : "cân dư"} {gap}
          </span>
        </span>
      )}
    </span>
  );
}

export function ReceivingTrips({
  trips,
  waiting,
}: {
  trips: readonly ReceiptView[];
  /** What the order still waits for, while it is in progress. */
  waiting: string | null;
}) {
  return (
    <section
      aria-labelledby="order-trips"
      className="flex flex-col gap-3 rounded-lg border bg-card p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="order-trips" className="font-display text-h2">
          Các chuyến nhập
        </h2>
        <span className="text-sm text-muted-foreground">
          Mỗi chuyến xe một phiếu nhập
        </span>
      </div>
      {trips.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-6 text-center text-muted-foreground">
          Chưa có chuyến nhập. Thủ kho nhập hàng trên điện thoại khi xe về.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {trips.map((trip) => (
            <li
              key={trip.code}
              aria-label={trip.code}
              className="flex flex-col gap-2 rounded-md border p-4 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{trip.code}</span>
                <ToneBadge tone="success">Đã ghi sổ</ToneBadge>
              </div>
              <p data-mask className="text-muted-foreground">
                {formatDateTime(trip.createdAt)}
                {trip.vehicle ? ` · xe ${trip.vehicle}` : ""} ·{" "}
                {trip.createdByName}
              </p>
              <dl className="grid gap-1 sm:grid-cols-2">
                {trip.lines
                  .filter((line) => line.status === "COUNTED")
                  .map((line) => (
                    <div
                      key={line.itemCode}
                      className="flex justify-between gap-3"
                    >
                      <dt>{line.itemName}</dt>
                      <dd className="tabular-nums">
                        {quantityText(
                          line.weighedKgMilli ?? line.quantityMilli,
                          line.weighedKgMilli === null ? line.itemUnit : "KG",
                        )}
                      </dd>
                    </div>
                  ))}
              </dl>
              <dl className="flex flex-col gap-1 border-t pt-2">
                {trip.costs.map((cost, index) => (
                  <div key={index} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{cost.label}</dt>
                    <dd className="tabular-nums">{formatMoney(cost.amount)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-3 font-semibold">
                  <dt>Chi phí chuyến này</dt>
                  <dd className="tabular-nums">
                    {formatMoney(trip.totalCosts)}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
          {waiting && (
            <li className="flex flex-col gap-1 rounded-md border border-dashed p-4 text-sm">
              <span className="font-semibold">Chuyến tiếp theo</span>
              <span>Người bán hẹn giao bù {waiting}.</span>
              <span className="text-muted-foreground">
                Đơn vẫn hiện ở &quot;Xe sắp về&quot; trên điện thoại thủ kho cho
                tới khi nhận đủ hoặc đóng đơn.
              </span>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}
