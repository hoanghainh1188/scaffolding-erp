import { ToneBadge, type BadgeTone } from "@/components/domain/tone-badge";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  REVISION_STATUS_LABELS,
  type ContractStatus,
  type ContractType,
  type RevisionStatus,
} from "@/domain/contract";

const STATUS_TONES: Readonly<Record<ContractStatus, BadgeTone>> = {
  DRAFT: "muted",
  PENDING: "warning",
  APPROVED: "primary",
  ACTIVE: "primary",
  CLOSED: "success",
  CANCELLED: "neutral",
};

const REVISION_TONES: Readonly<Record<RevisionStatus, BadgeTone>> = {
  DRAFT: "muted",
  PENDING: "warning",
  APPROVED: "success",
  CANCELLED: "neutral",
};

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  return (
    <ToneBadge tone={STATUS_TONES[status]}>
      {CONTRACT_STATUS_LABELS[status]}
    </ToneBadge>
  );
}

export function RevisionStatusBadge({ status }: { status: RevisionStatus }) {
  return (
    <ToneBadge tone={REVISION_TONES[status]}>
      {REVISION_STATUS_LABELS[status]}
    </ToneBadge>
  );
}

/** "Cho thuê" stands out (90 % of the business, 0.2 #43); "Bán" stays quiet. */
export function ContractTypeBadge({ type }: { type: ContractType }) {
  return (
    <ToneBadge tone={type === "RENTAL" ? "highlight" : "muted"}>
      {CONTRACT_TYPE_LABELS[type]}
    </ToneBadge>
  );
}
