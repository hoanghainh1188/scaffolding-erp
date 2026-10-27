// A posted goods receipt, read-only (spec goods-receipts "Phiếu nhập chỉ
// xem"). Shared by /m/receipts/[code] and the trips on D3b.
import { CheckCircle2 } from "lucide-react";

import { ConditionBadge } from "@/components/domain/condition-badge";
import { CONDITIONS } from "@/domain/condition";
import { formatBusinessDate, formatDateTime } from "@/domain/business-date";
import { formatMoney } from "@/domain/money";
import { PURCHASE_KIND_LABELS } from "@/domain/purchase-order";
import type { ReceiptView as Receipt } from "@/lib/receiving/queries";

import { quantityText } from "./receipt-model";

export function ReceiptView({
  receipt,
  posted = false,
}: {
  receipt: Receipt;
  posted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {posted && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border-2 border-success bg-card p-4 text-label text-success"
        >
          <CheckCircle2 aria-hidden className="size-5" />
          Đã nhập kho {receipt.code}
        </p>
      )}
      <section className="flex flex-col gap-1">
        <h2 className="font-display text-h2">Phiếu nhập {receipt.code}</h2>
        <p className="text-label text-muted-foreground">
          {receipt.orderCode} · chuyến {receipt.tripNo} · Đã ghi sổ
        </p>
      </section>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border bg-card p-4 text-body">
        <dt className="text-muted-foreground">Người bán</dt>
        <dd>
          {receipt.supplierName} · {PURCHASE_KIND_LABELS[receipt.kind]}
        </dd>
        <dt className="text-muted-foreground">Ngày ghi sổ</dt>
        <dd>
          {formatBusinessDate(receipt.businessDate)} ·{" "}
          {formatDateTime(receipt.createdAt).slice(11)}
        </dd>
        {receipt.arrivedAt && (
          <>
            <dt className="text-muted-foreground">Xe về lúc</dt>
            <dd>{formatDateTime(receipt.arrivedAt)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Xe</dt>
        <dd>{receipt.vehicle ?? "–"}</dd>
        <dt className="text-muted-foreground">Người nhập</dt>
        <dd>{receipt.createdByName}</dd>
        <dt className="text-muted-foreground">Bãi nhập</dt>
        <dd>{receipt.locationName}</dd>
        {receipt.scrapPricePerKg !== null && (
          <>
            <dt className="text-muted-foreground">Giá sắt vụn</dt>
            <dd>{formatMoney(receipt.scrapPricePerKg)}/kg</dd>
          </>
        )}
      </dl>
      <section aria-label="Hàng đã nhận" className="flex flex-col gap-3">
        {receipt.lines.map((line) => (
          <article
            key={line.itemCode}
            className="flex flex-col gap-2 rounded-lg border bg-card p-4"
          >
            <h3 className="text-h3">{line.itemName}</h3>
            {line.status === "NOT_IN_TRIP" ? (
              <p className="text-body text-muted-foreground">
                Chuyến này không có
                {line.awaitsRest && " · chờ chuyến sau"}
              </p>
            ) : (
              <>
                <p className="text-body">
                  Thực nhận {quantityText(line.quantityMilli, line.itemUnit)}
                  {line.weighedKgMilli !== null &&
                    ` · cân ${quantityText(line.weighedKgMilli, "KG")}`}
                  {line.awaitsRest && " · chờ giao bù"}
                </p>
                <ul className="flex flex-wrap gap-2">
                  {CONDITIONS.filter((c) => line.split[c] > 0).map((c) => (
                    <li key={c} className="flex items-center gap-1 text-body">
                      <ConditionBadge condition={c} />
                      {quantityText(line.split[c], line.itemUnit)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>
        ))}
      </section>
      <section className="flex flex-col gap-2 rounded-lg border bg-card p-4">
        <h3 className="text-h3">Chi phí chuyến này</h3>
        {receipt.costs.length === 0 && (
          <p className="text-body text-muted-foreground">Không có chi phí</p>
        )}
        {receipt.costs.map((cost, index) => (
          <p key={index} className="flex justify-between text-body">
            <span>{cost.label}</span>
            <span className="tabular-nums">{formatMoney(cost.amount)}</span>
          </p>
        ))}
        <p className="flex justify-between border-t pt-2 text-label">
          <span>Tổng chi phí chuyến</span>
          <span className="tabular-nums">
            {formatMoney(receipt.totalCosts)}
          </span>
        </p>
      </section>
    </div>
  );
}
