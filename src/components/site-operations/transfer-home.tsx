// M1 "Chuyển công trình" (spec mobile-home): one card per transfer sent to
// the phone, no price; it counts in the day's work.
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { TransferListRow } from "@/lib/site-transfers/queries";
import { transferTotalText } from "@/domain/site-operations-summary";

export function TransferHome({ transfers }: { transfers: TransferListRow[] }) {
  if (transfers.length === 0) return null;
  return (
    <section
      aria-labelledby="transfers-title"
      data-mask
      className="flex flex-col gap-3"
    >
      <h2 id="transfers-title" className="text-h3">
        Chuyển công trình
      </h2>
      {transfers.map((transfer) => (
        <article
          key={transfer.code}
          aria-label={transfer.code}
          className="flex flex-col gap-3 rounded-lg border bg-card p-4"
        >
          <p className="text-label">
            {transfer.code} · {transfer.fromSite} → {transfer.toSite} ·{" "}
            {transferTotalText(transfer.lines)}
          </p>
          <Button asChild className="h-12">
            <Link
              href={`/m/site-transfers/${encodeURIComponent(transfer.code)}`}
            >
              Xác nhận
            </Link>
          </Button>
        </article>
      ))}
    </section>
  );
}
