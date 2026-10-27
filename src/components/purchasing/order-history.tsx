import { formatDateTime } from "@/domain/business-date";
import type { OrderEventRow } from "@/lib/purchasing/queries";

const SAYS: Readonly<Record<string, string>> = {
  CREATED: "tạo đơn",
  PLACED: "gửi đơn cho kho",
  UPDATED: "sửa đơn",
  CANCELLED: "hủy đơn",
  CLOSED: "đóng đơn",
};

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
        {events.map((event) => (
          <li key={event.id}>
            <span className="font-semibold tabular-nums">
              {formatDateTime(event.createdAt).replace(/\/\d{4}/, "")}
            </span>{" "}
            · {event.actorName} {SAYS[event.kind] ?? event.kind}
            {event.note ? `: ${event.note}` : ""}
          </li>
        ))}
      </ol>
    </section>
  );
}
