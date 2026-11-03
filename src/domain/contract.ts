// Contracts (contracts spec, design D1, D3): types, statuses, the one table
// of allowed status changes for contracts and amendments, the overdue-debt
// reason rule (0.2 #15) and what a draft needs before it is sent.
import { DomainValueError } from "./errors";
import { formatMoney, toMoney } from "./money";

export const CONTRACT_TYPES = ["RENTAL", "SALE"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_TYPE_LABELS: Readonly<Record<ContractType, string>> = {
  RENTAL: "Cho thuê",
  SALE: "Bán",
};

export const CONTRACT_STATUSES = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "ACTIVE",
  "CLOSED",
  "CANCELLED",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_STATUS_LABELS: Readonly<Record<ContractStatus, string>> =
  {
    DRAFT: "Nháp",
    PENDING: "Chờ duyệt",
    APPROVED: "Đã duyệt",
    ACTIVE: "Đang thực hiện",
    CLOSED: "Thanh lý",
    CANCELLED: "Đã hủy",
  };

/** Statuses of a revision: the original (until approval) or an amendment. */
export const REVISION_STATUSES = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "CANCELLED",
] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export const REVISION_STATUS_LABELS: Readonly<Record<RevisionStatus, string>> =
  {
    DRAFT: "Nháp",
    PENDING: "Chờ duyệt",
    APPROVED: "Đã duyệt",
    CANCELLED: "Đã hủy",
  };

/** The four tiles of D4. */
export const CONTRACT_GROUPS = ["all", "pending", "active", "ended"] as const;
export type ContractGroup = (typeof CONTRACT_GROUPS)[number];

export const CONTRACT_GROUP_LABELS: Readonly<Record<ContractGroup, string>> = {
  all: "Tất cả",
  pending: "Chờ duyệt",
  active: "Đang hiệu lực",
  ended: "Đã kết thúc",
};

/** The D4 tile a status counts in (drafts only in "Tất cả"). */
export function statusGroup(
  status: ContractStatus,
): Exclude<ContractGroup, "all"> | null {
  if (status === "PENDING") return "pending";
  if (status === "APPROVED" || status === "ACTIVE") return "active";
  if (status === "CLOSED" || status === "CANCELLED") return "ended";
  return null;
}

export const GROUP_STATUSES: Readonly<
  Record<Exclude<ContractGroup, "all">, readonly ContractStatus[]>
> = {
  pending: ["PENDING"],
  active: ["APPROVED", "ACTIVE"],
  ended: ["CLOSED", "CANCELLED"],
};

const REASON_MAX = 500;

const STATUS_PHRASE: Partial<Record<ContractStatus, string>> = {
  DRAFT: "chưa duyệt",
  PENDING: "chưa duyệt",
  CLOSED: "đã thanh lý",
  CANCELLED: "đã hủy",
};

export const CONTRACT_MESSAGES = {
  notFound: "Không tìm thấy hợp đồng",
  stale:
    "Hợp đồng vừa được người khác sửa. Bạn tải lại để xem bản mới rồi sửa tiếp.",
  editSent:
    "Hợp đồng đã gửi duyệt nên không sửa được. Bạn chờ Giám đốc duyệt hoặc trả lại.",
  editApproved:
    "Hợp đồng đã duyệt không sửa trực tiếp được. Bạn lập phụ lục để đổi.",
  editEnded: "Hợp đồng đã kết thúc nên không sửa được.",
  submitApproved:
    "Hợp đồng đã được duyệt nên không gửi duyệt lại được. Bạn lập phụ lục nếu cần đổi.",
  submitPending: "Hợp đồng đã được gửi duyệt.",
  notPending: "Hợp đồng không ở trạng thái chờ duyệt.",
  approvedAlready: "Hợp đồng đã được duyệt.",
  delivered: "Hợp đồng đã xuất hàng nên không hủy được.",
  openDeliveries: (code: string) =>
    `Hợp đồng còn phiếu xuất ${code} chưa xong. Bạn hủy phiếu xuất đó trước rồi hủy hợp đồng.`,
  cancelNotAllowed: "Hợp đồng ở trạng thái này không hủy được.",
  ended: "Hợp đồng đã kết thúc nên không đổi trạng thái được.",
  notStarted: "Hợp đồng chưa duyệt nên chưa xuất hàng được.",
  notActive: "Hợp đồng chưa có hàng ở công trình nên chưa thanh lý được.",
  returnReason: "Bạn ghi lý do để người lập biết cần sửa gì.",
  cancelReason: "Bạn ghi lý do hủy.",
  reasonTooLong: `Lý do dài tối đa ${REASON_MAX} ký tự.`,
  overdue: (amount: number, days: number) =>
    `Nhà thầu đang nợ quá hạn ${formatMoney(toMoney(amount))} (${days} ngày). Bạn ghi lý do vẫn duyệt.`,
  noLines:
    "Hợp đồng chưa có hàng. Bạn thêm ít nhất một dòng trước khi gửi duyệt.",
  noRentPrice: (code: string) =>
    `Mã ${code} chưa có giá thuê. Bạn nhập giá cho dòng này.`,
  noSalePrice: (code: string) =>
    `Mã ${code} chưa có đơn giá bán. Bạn nhập giá cho dòng này.`,
  noCompensation: (code: string) =>
    `Mã ${code} chưa có giá đền bù. Bạn nhập giá mất và giá hỏng (có thể là 0 ₫).`,
  noEndDate: "Hợp đồng cho thuê cần ngày kết thúc dự kiến.",
  amendNotApproved:
    "Hợp đồng chưa duyệt nên chưa lập phụ lục được. Bạn sửa thẳng khi hợp đồng còn Nháp.",
  amendOpen: (number: string) =>
    `Hợp đồng đang có phụ lục ${number} chưa duyệt. Bạn chờ duyệt xong hoặc hủy phụ lục đó trước.`,
  amendOnContract: (status: ContractStatus, verb: string) =>
    `Hợp đồng ${STATUS_PHRASE[status] ?? "không còn hiệu lực"} nên không ${verb} phụ lục được.`,
  amendApproved: "Phụ lục đã duyệt không sửa được. Bạn lập phụ lục mới.",
  amendCancelled: "Phụ lục đã hủy.",
  amendPending:
    "Phụ lục đã gửi duyệt nên không sửa được. Bạn chờ Giám đốc duyệt hoặc trả lại.",
  amendNotPending: "Phụ lục không ở trạng thái chờ duyệt.",
  amendReason: "Bạn ghi lý do lập phụ lục.",
} as const;

// ----------------------------------------------------------- contracts

export type ContractCommand =
  "SUBMIT" | "APPROVE" | "RETURN" | "CANCEL" | "START" | "CLOSE";

export interface ContractState {
  status: ContractStatus;
  /** A delivery note was posted (change deliveries); false until then. */
  hasDeliveries: boolean;
}

const fail = (message: string): never => {
  throw new DomainValueError(message);
};

/**
 * The only table of contract status changes (design D1). Who may run a
 * command is checked by the caller (canContract, contracts.approve).
 */
export function transition(
  state: ContractState,
  command: ContractCommand,
): ContractStatus {
  const { status } = state;
  if (status === "CLOSED" || status === "CANCELLED") {
    return fail(CONTRACT_MESSAGES.ended);
  }
  switch (command) {
    case "SUBMIT":
      if (status === "DRAFT") return "PENDING";
      return fail(
        status === "PENDING"
          ? CONTRACT_MESSAGES.submitPending
          : CONTRACT_MESSAGES.submitApproved,
      );
    case "APPROVE":
      if (status === "PENDING") return "APPROVED";
      return fail(
        status === "DRAFT"
          ? CONTRACT_MESSAGES.notPending
          : CONTRACT_MESSAGES.approvedAlready,
      );
    case "RETURN":
      if (status === "PENDING") return "DRAFT";
      return fail(CONTRACT_MESSAGES.notPending);
    case "CANCEL":
      if (status === "DRAFT") return "CANCELLED";
      if (status === "APPROVED") {
        return state.hasDeliveries
          ? fail(CONTRACT_MESSAGES.delivered)
          : "CANCELLED";
      }
      if (status === "ACTIVE") return fail(CONTRACT_MESSAGES.delivered);
      return fail(CONTRACT_MESSAGES.cancelNotAllowed);
    case "START":
      if (status === "APPROVED") return "ACTIVE";
      return fail(CONTRACT_MESSAGES.notStarted);
    case "CLOSE":
      if (status === "ACTIVE") return "CLOSED";
      return fail(CONTRACT_MESSAGES.notActive);
  }
}

/** Why a draft cannot be edited, or null when it can. */
export function editBlocker(status: ContractStatus): string | null {
  if (status === "DRAFT") return null;
  if (status === "PENDING") return CONTRACT_MESSAGES.editSent;
  if (status === "APPROVED" || status === "ACTIVE") {
    return CONTRACT_MESSAGES.editApproved;
  }
  return CONTRACT_MESSAGES.editEnded;
}

// ----------------------------------------------------------- reasons

function trimmed(reason: string | null | undefined): string | null {
  const text = (reason ?? "").trim();
  if (text === "") return null;
  if (text.length > REASON_MAX) fail(CONTRACT_MESSAGES.reasonTooLong);
  return text;
}

/** A reason the command cannot go without ("Trả lại", "Hủy"). */
export function requiredReason(
  reason: string | null | undefined,
  message: string,
): string {
  return trimmed(reason) ?? fail(message);
}

/** An optional note, trimmed; empty is null. */
export function optionalReason(
  reason: string | null | undefined,
): string | null {
  return trimmed(reason);
}

export interface OverdueDebt {
  /** ₫ overdue; 0 when none (or before receivables exists). */
  amount: number;
  days: number;
}

/**
 * 0.2 #15: overdue debt never blocks approval, but the director must write
 * why. Returns the reason to store (null when not needed and not given).
 */
export function approvalReason(
  overdue: OverdueDebt,
  reason: string | null | undefined,
): string | null {
  const text = trimmed(reason);
  if (overdue.amount > 0 && text === null) {
    fail(CONTRACT_MESSAGES.overdue(overdue.amount, overdue.days));
  }
  return text;
}

// ----------------------------------------------------------- submitting

export interface SubmitLine {
  itemCode: string;
  price: number | null;
}

export interface SubmitCompensation {
  itemCode: string;
  lostPrice: number | null;
  damagePrice: number | null;
}

export interface SubmitDraft {
  type: ContractType;
  endDate: string | null;
  lines: readonly SubmitLine[];
  compensations: readonly SubmitCompensation[];
}

/** What blocks "Gửi Giám đốc duyệt" (contracts spec), the first one found. */
export function checkSubmittable(draft: SubmitDraft): void {
  if (draft.lines.length === 0) fail(CONTRACT_MESSAGES.noLines);
  if (draft.type === "RENTAL" && !draft.endDate) {
    fail(CONTRACT_MESSAGES.noEndDate);
  }
  for (const line of draft.lines) {
    if (line.price === null) {
      fail(
        draft.type === "RENTAL"
          ? CONTRACT_MESSAGES.noRentPrice(line.itemCode)
          : CONTRACT_MESSAGES.noSalePrice(line.itemCode),
      );
    }
  }
  if (draft.type !== "RENTAL") return;
  const priced = new Map(
    draft.compensations.map((entry) => [entry.itemCode, entry]),
  );
  for (const line of draft.lines) {
    const entry = priced.get(line.itemCode);
    if (!entry || entry.lostPrice === null || entry.damagePrice === null) {
      fail(CONTRACT_MESSAGES.noCompensation(line.itemCode));
    }
  }
}

// ----------------------------------------------------------- amendments

export type AmendmentCommand =
  "EDIT" | "SUBMIT" | "APPROVE" | "RETURN" | "CANCEL";

const AMEND_VERB: Readonly<Record<AmendmentCommand, string>> = {
  EDIT: "lưu",
  SUBMIT: "gửi duyệt",
  APPROVE: "duyệt",
  RETURN: "trả lại",
  CANCEL: "hủy",
};

/** A contract an amendment may be made or moved on. */
export function amendable(status: ContractStatus): boolean {
  return status === "APPROVED" || status === "ACTIVE";
}

/**
 * The amendment table (design D1). The contract is checked first: a
 * contract cancelled while its amendment waited refuses every command.
 * EDIT returns the same status.
 */
export function amendmentTransition(
  contractStatus: ContractStatus,
  status: RevisionStatus,
  command: AmendmentCommand,
): RevisionStatus {
  if (!amendable(contractStatus)) {
    return fail(
      CONTRACT_MESSAGES.amendOnContract(contractStatus, AMEND_VERB[command]),
    );
  }
  if (status === "APPROVED") return fail(CONTRACT_MESSAGES.amendApproved);
  if (status === "CANCELLED") return fail(CONTRACT_MESSAGES.amendCancelled);
  switch (command) {
    case "EDIT":
      return status === "DRAFT"
        ? "DRAFT"
        : fail(CONTRACT_MESSAGES.amendPending);
    case "SUBMIT":
      return status === "DRAFT"
        ? "PENDING"
        : fail(CONTRACT_MESSAGES.amendPending);
    case "APPROVE":
      return status === "PENDING"
        ? "APPROVED"
        : fail(CONTRACT_MESSAGES.amendNotPending);
    case "RETURN":
      return status === "PENDING"
        ? "DRAFT"
        : fail(CONTRACT_MESSAGES.amendNotPending);
    case "CANCEL":
      return "CANCELLED";
  }
}
