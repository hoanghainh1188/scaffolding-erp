import { formatMoney, type Money } from "@/domain/money";

interface OrderTotalProps {
  title: string;
  total: Money;
  rows: { label: string; value: Money }[];
  note?: string;
}

/** The one solid primary block of D3 / D3b (ui.md: one per screen). */
export function OrderTotal({ title, total, rows, note }: OrderTotalProps) {
  return (
    <section
      aria-label={title}
      className="relative flex flex-col gap-2 overflow-hidden rounded-xl bg-primary p-5 text-primary-foreground"
    >
      <div
        aria-hidden
        className="absolute -top-14 -right-10 size-32 rounded-full bg-highlight"
      />
      <h2 className="relative text-base font-semibold">{title}</h2>
      <p
        data-testid="order-total"
        className="relative font-display text-h1 tabular-nums"
      >
        {formatMoney(total)}
      </p>
      {rows.length ? (
        <dl className="relative flex flex-col gap-1 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-3">
              <dt>{row.label}</dt>
              <dd className="tabular-nums">{formatMoney(row.value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {note ? <p className="relative text-sm">{note}</p> : null}
    </section>
  );
}
