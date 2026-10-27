import { formatDateTime } from "@/domain/business-date";
import type { OrderEventRow } from "@/lib/purchasing/queries";

const SAYS: Readonly<Record<string, string>> = {
  CREATED: "tạo đơn",
  PLACED: "gửi đơn cho kho",
  UPDATED: "sửa đơn",
  CANCELLED: "hủy đơn",
  CLOSED: "đóng đơn",
  RECEIVED: "nhận đủ hàng",
};

export interface HistoryLine {
  id: number;
  createdAt: Date;
  text: string;
}

/**
 * History lines, newest first (spec "Lịch sử đơn"). A receipt and the
 * backorder it marked read as one line: "Văn Tùng ghi sổ PN-2026-090,
 * đánh dấu chờ giao bù 40 mâm giàn giáo 1,6m".
 */
export function historyLines(events: readonly OrderEventRow[]): HistoryLine[] {
  const lines: HistoryLine[] = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index] as OrderEventRow;
    const older = events[index + 1];
    if (
      event.kind === "BACKORDER_MARKED" &&
      older?.kind === "RECEIPT_POSTED" &&
      older.actorName === event.actorName
    ) {
      lines.push({
        id: event.id,
        createdAt: older.createdAt,
        text: `${event.actorName} ghi sổ ${older.note}, đánh dấu chờ giao bù ${event.note}`,
      });
      index += 1;
      continue;
    }
    const text =
      event.kind === "RECEIPT_POSTED"
        ? `${event.actorName} ghi sổ ${event.note}`
        : event.kind === "BACKORDER_MARKED"
          ? `${event.actorName} đánh dấu chờ giao bù ${event.note}`
          : `${event.actorName} ${SAYS[event.kind] ?? event.kind}${event.note ? `: ${event.note}` : ""}`;
    lines.push({ id: event.id, createdAt: event.createdAt, text });
  }
  return lines;
}

/** D3b "Lịch sử": newest first (spec "Lịch sử đơn"). */
export function OrderHistory({ events }: { events: OrderEventRow[] }) {
  return (
    <section
      aria-labelledby="order-history"
      className="flex flex-col gap-3 rounded-lg border bg-card p-5"
    >
      <h2 id="order-history" className="font-display text-h2">
        Lịch sử
      </h2>
      <ol data-mask className="flex flex-col gap-2 text-sm">
        {historyLines(events).map((line) => (
          <li key={line.id}>
            <span className="font-semibold tabular-nums">
              {formatDateTime(line.createdAt).replace(/\/\d{4}/, "")}
            </span>{" "}
            · {line.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
