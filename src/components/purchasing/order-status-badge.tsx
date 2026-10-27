import { DocumentStatusBadge } from "@/components/domain/document-status-badge";
import { ToneBadge } from "@/components/domain/tone-badge";
import {
  PURCHASE_KIND_LABELS,
  purchaseStatusLabel,
  type PurchaseKind,
  type PurchaseOutcome,
  type PurchaseStatus,
} from "@/domain/purchase-order";

interface OrderStatusBadgeProps {
  status: PurchaseStatus;
  outcome: PurchaseOutcome | null;
  hasReceipts: boolean;
}

/** "Đang xử lý" + "Chờ xe về" (spec "Trạng thái đơn thu mua"). */
export function OrderStatusBadge({
  status,
  outcome,
  hasReceipts,
}: OrderStatusBadgeProps) {
  const label = purchaseStatusLabel(status, outcome, hasReceipts);
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <DocumentStatusBadge status={status} />
      {label.detail ? (
        <span className="text-caption text-muted-foreground">
          {label.detail}
        </span>
      ) : null}
    </span>
  );
}

/** "Hàng mới" stands out; "Đã qua sử dụng" stays quiet (drawing D2). */
export function OrderKindBadge({ kind }: { kind: PurchaseKind }) {
  return (
    <ToneBadge tone={kind === "NEW" ? "highlight" : "muted"}>
      {PURCHASE_KIND_LABELS[kind]}
    </ToneBadge>
  );
}
