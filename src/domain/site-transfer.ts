// Site transfers (site-operations design D1–D3; 0.2 #66, #69, #70): the
// status table, what may be moved from one rental contract's site to
// another's, the ledger lines of a posting and what the phone may carry.
// Pure: the service reads the contracts, stock and terms, then calls these.
import { type Condition } from "./condition";
import {
  drawNewFirst,
  SITE_DRAW_ORDER,
  type SiteStock,
} from "./condition-split";
import { DomainValueError } from "./errors";
import type { MovementDraft } from "./movement";
import {
  formatQuantity,
  isCountUnit,
  QUANTITY_UNIT_LABELS,
  toQuantity,
  type QuantityUnit,
} from "./quantity";

export const SITE_TRANSFER_PREFIX = "CCT";
export const TRANSFER_PLATE_MAX = 20;
export const TRANSFER_NOTE_MAX = 500;
export const TRANSFER_REASON_MAX = 500;

export const TRANSFER_STATUSES = [
  "DRAFT",
  "SENT",
  "POSTED",
  "CANCELLED",
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export const TRANSFER_STATUS_LABELS: Readonly<Record<TransferStatus, string>> =
  {
    DRAFT: "Nháp",
    SENT: "Chờ xác nhận",
    POSTED: "Đã chuyển",
    CANCELLED: "Đã hủy",
  };

/** Statuses of a transfer that is not finished. */
export const OPEN_TRANSFER_STATUSES: readonly TransferStatus[] = [
  "DRAFT",
  "SENT",
];

export const CONFIRM_MODES = ["OFFICE", "PHONE"] as const;
export type ConfirmMode = (typeof CONFIRM_MODES)[number];

const amount = (milli: number, unit: QuantityUnit) =>
  `${formatQuantity(toQuantity(milli, unit))} ${QUANTITY_UNIT_LABELS[unit]}`;

export const TRANSFER_MESSAGES = {
  fromNotActive: "Chỉ chuyển được hàng của hợp đồng thuê đang thực hiện.",
  toNotRental: "Chỉ chuyển sang hợp đồng thuê đã duyệt hoặc đang thực hiện.",
  sameContract: "Hợp đồng nhận phải khác hợp đồng đi.",
  noLines: "Phiếu chuyển chưa có hàng nào. Nhập số chuyển của ít nhất một mã.",
  positive: (code: string) => `${code}: số chuyển phải lớn hơn 0.`,
  wholePieces: (code: string, unit: QuantityUnit) =>
    `${code} tính theo ${QUANTITY_UNIT_LABELS[unit]}, số lượng phải là số nguyên`,
  duplicate: (code: string) =>
    `${code} có hai dòng trên phiếu. Gộp lại thành một dòng.`,
  notOnTarget: (code: string, contractCode: string) =>
    `${code} chưa có trên hợp đồng ${contractCode}. Bạn lập phụ lục cho hợp đồng đó trước.`,
  notOnSite: (code: string, siteName: string) =>
    `${code} không có ở công trình ${siteName}.`,
  tooMany: (
    code: string,
    unit: QuantityUnit,
    movedMilli: number,
    onSiteMilli: number,
    siteName: string,
  ) =>
    `${code}: số chuyển (${amount(movedMilli, unit)}) nhiều hơn số đang ở công trình ${siteName} (${amount(onSiteMilli, unit)}).`,
  otherCustomer: (from: string, to: string) =>
    `Hai hợp đồng khác nhà thầu (${from} → ${to}). Bạn tích xác nhận trước khi chuyển.`,
  overContract: (
    code: string,
    unit: QuantityUnit,
    movedMilli: number,
    remainingMilli: number,
  ) =>
    `${code}: chuyển ${amount(movedMilli, unit)}, hợp đồng nhận chỉ còn phải giao ${amount(remainingMilli, unit)}. Bạn xác nhận nếu đúng.`,
  movedOver: (
    code: string,
    unit: QuantityUnit,
    moved: number,
    planned: number,
  ) =>
    `Bạn chở ${amount(moved, unit)} ${code}, nhiều hơn số văn phòng ghi ${amount(planned, unit)}. Văn phòng cần sửa phiếu nếu muốn chuyển thêm.`,
  movedNegative: (code: string) => `${code}: số thực chở không được âm.`,
  nothingMoved:
    "Phiếu chưa có hàng nào được chở. Bạn báo văn phòng hủy phiếu nếu không chuyển.",
  editSent: "Phiếu đã gửi điện thoại. Bạn rút về rồi sửa.",
  posted: (code: string) => `Phiếu ${code} đã chuyển nên không sửa được.`,
  cancelled: (code: string) => `Phiếu ${code} đã hủy.`,
  notSent: (code: string) => `Phiếu ${code} chưa gửi điện thoại.`,
  notDraft: (code: string) =>
    `Phiếu ${code} đã gửi điện thoại. Bạn rút về rồi xác nhận ở văn phòng.`,
  cancelReason: "Bạn ghi lý do hủy phiếu chuyển.",
  reasonLong: `Lý do tối đa ${TRANSFER_REASON_MAX} ký tự.`,
  plateLong: `Biển số xe tối đa ${TRANSFER_PLATE_MAX} ký tự.`,
  noteLong: `Ghi chú tối đa ${TRANSFER_NOTE_MAX} ký tự.`,
} as const;

const fail = (message: string): never => {
  throw new DomainValueError(message);
};

// ----------------------------------------------------------- status

export type TransferCommand = "EDIT" | "SEND" | "PULL_BACK" | "POST" | "CANCEL";

/**
 * The only table of transfer changes (design D1). EDIT keeps DRAFT; POST
 * runs from DRAFT for the office and from SENT for the phone (`byPhone`).
 * Who may run a command is checked by the caller.
 */
export function transition(
  status: TransferStatus,
  command: TransferCommand,
  code: string,
  byPhone = false,
): TransferStatus {
  if (status === "POSTED") return fail(TRANSFER_MESSAGES.posted(code));
  if (status === "CANCELLED") return fail(TRANSFER_MESSAGES.cancelled(code));
  switch (command) {
    case "EDIT":
      return status === "DRAFT" ? "DRAFT" : fail(TRANSFER_MESSAGES.editSent);
    case "SEND":
      return status === "DRAFT" ? "SENT" : fail(TRANSFER_MESSAGES.editSent);
    case "PULL_BACK":
      return status === "SENT"
        ? "DRAFT"
        : fail(TRANSFER_MESSAGES.notSent(code));
    case "POST":
      if (byPhone) {
        return status === "SENT"
          ? "POSTED"
          : fail(TRANSFER_MESSAGES.notSent(code));
      }
      return status === "DRAFT"
        ? "POSTED"
        : fail(TRANSFER_MESSAGES.notDraft(code));
    case "CANCEL":
      return "CANCELLED";
  }
}

/** A reason typed in a dialog: trimmed, required, at most 500 characters. */
export function requireTransferReason(
  reason: string | null | undefined,
): string {
  const text = (reason ?? "").trim();
  if (text.length === 0) fail(TRANSFER_MESSAGES.cancelReason);
  if (text.length > TRANSFER_REASON_MAX) fail(TRANSFER_MESSAGES.reasonLong);
  return text;
}

// ----------------------------------------------------------- contracts

export interface TransferContract {
  id: string;
  code: string;
  type: "RENTAL" | "SALE";
  status: string;
  customerId: string;
  customerName: string;
  siteName: string;
}

/** Design D3: from a running rental to another approved or running rental. */
export function assertTransferContracts(
  from: TransferContract,
  to: TransferContract,
): void {
  if (from.type !== "RENTAL" || from.status !== "ACTIVE") {
    fail(TRANSFER_MESSAGES.fromNotActive);
  }
  if (from.id === to.id) fail(TRANSFER_MESSAGES.sameContract);
  if (
    to.type !== "RENTAL" ||
    (to.status !== "APPROVED" && to.status !== "ACTIVE")
  ) {
    fail(TRANSFER_MESSAGES.toNotRental);
  }
}

// ----------------------------------------------------------- lines

export interface TransferLineInput {
  itemId: string;
  itemCode: string;
  unit: QuantityUnit;
  /** In thousandths of the item's unit. */
  milli: number;
}

export interface TransferCheck {
  from: TransferContract;
  to: TransferContract;
  lines: readonly TransferLineInput[];
  /** Stock of the source contract at its site, by item and condition. */
  onSite: ReadonlyMap<string, SiteStock>;
  /** Items on the receiving contract's revision in force today. */
  onTarget: ReadonlySet<string>;
  /** "Còn phải giao" of the receiving contract, by item. */
  remaining: ReadonlyMap<string, number>;
  otherCustomerConfirmed: boolean;
  overContractConfirmed: boolean;
}

export interface TransferCheckResult {
  lines: TransferLineInput[];
  sameCustomer: boolean;
  /** Ticks that were needed: the log flags them (0.2 #56, #66). */
  unusual: boolean;
}

const siteTotal = (stock: SiteStock | undefined) =>
  stock ? stock.NEW + stock.GOOD : 0;

/**
 * Everything a transfer must satisfy, when saved and again when posted
 * (design D3). Lines with 0 are dropped; a transfer with none is refused.
 */
export function assertTransferLines(input: TransferCheck): TransferCheckResult {
  assertTransferContracts(input.from, input.to);
  const seen = new Set<string>();
  const kept: TransferLineInput[] = [];
  let over = false;
  for (const line of input.lines) {
    if (line.milli < 0) fail(TRANSFER_MESSAGES.positive(line.itemCode));
    if (isCountUnit(line.unit) && line.milli % 1000 !== 0) {
      fail(TRANSFER_MESSAGES.wholePieces(line.itemCode, line.unit));
    }
    if (seen.has(line.itemId)) fail(TRANSFER_MESSAGES.duplicate(line.itemCode));
    seen.add(line.itemId);
    if (line.milli === 0) continue;
    if (!input.onTarget.has(line.itemId)) {
      fail(TRANSFER_MESSAGES.notOnTarget(line.itemCode, input.to.code));
    }
    const stock = siteTotal(input.onSite.get(line.itemId));
    if (stock <= 0) {
      fail(TRANSFER_MESSAGES.notOnSite(line.itemCode, input.from.siteName));
    }
    if (line.milli > stock) {
      fail(
        TRANSFER_MESSAGES.tooMany(
          line.itemCode,
          line.unit,
          line.milli,
          stock,
          input.from.siteName,
        ),
      );
    }
    const left = input.remaining.get(line.itemId) ?? 0;
    if (line.milli > left) {
      if (!input.overContractConfirmed) {
        fail(
          TRANSFER_MESSAGES.overContract(
            line.itemCode,
            line.unit,
            line.milli,
            Math.max(left, 0),
          ),
        );
      }
      over = true;
    }
    kept.push(line);
  }
  if (kept.length === 0) fail(TRANSFER_MESSAGES.noLines);
  const sameCustomer = input.from.customerId === input.to.customerId;
  if (!sameCustomer && !input.otherCustomerConfirmed) {
    fail(
      TRANSFER_MESSAGES.otherCustomer(
        input.from.customerName,
        input.to.customerName,
      ),
    );
  }
  return { lines: kept, sameCustomer, unusual: over || !sameCustomer };
}

export interface MovedLine {
  itemId: string;
  itemCode: string;
  unit: QuantityUnit;
  plannedMilli: number;
  movedMilli: number;
}

/** What the phone carried (0.2 #69): never more than planned, not all 0. */
export function assertMovedQuantities(lines: readonly MovedLine[]): void {
  for (const line of lines) {
    if (line.movedMilli < 0)
      fail(TRANSFER_MESSAGES.movedNegative(line.itemCode));
    if (isCountUnit(line.unit) && line.movedMilli % 1000 !== 0) {
      fail(TRANSFER_MESSAGES.wholePieces(line.itemCode, line.unit));
    }
    if (line.movedMilli > line.plannedMilli) {
      fail(
        TRANSFER_MESSAGES.movedOver(
          line.itemCode,
          line.unit,
          line.movedMilli,
          line.plannedMilli,
        ),
      );
    }
  }
  if (lines.every((line) => line.movedMilli === 0)) {
    fail(TRANSFER_MESSAGES.nothingMoved);
  }
}

// ----------------------------------------------------------- ledger

export interface AllocateTransferInput {
  code: string;
  fromLocationId: string;
  toLocationId: string;
  itemId: string;
  milli: number;
  onSite: SiteStock;
}

/**
 * The ledger lines of one item (design D2): per condition drawn (Mới first),
 * a TRANSFER_OUT at the source site and a paired TRANSFER_IN at the target.
 */
export function allocateTransfer(
  input: AllocateTransferInput,
): MovementDraft[] {
  const { taken } = drawNewFirst(input.milli, input.onSite);
  const drafts: MovementDraft[] = [];
  for (const source of SITE_DRAW_ORDER) {
    const milli = taken[source];
    if (milli === 0) continue;
    const condition: Condition = source;
    const out = drafts.length;
    drafts.push({
      itemId: input.itemId,
      condition,
      locationId: input.fromLocationId,
      movement: "TRANSFER_OUT",
      quantityMilli: -milli,
      description: `${input.code}: Chuyển sang công trình khác`,
    });
    drafts.push({
      itemId: input.itemId,
      condition,
      locationId: input.toLocationId,
      movement: "TRANSFER_IN",
      quantityMilli: milli,
      pairedWith: out,
      description: `${input.code}: Nhận từ công trình khác`,
    });
  }
  return drafts;
}

/** "Rút từ" on D6b: "20 Mới · 30 Tốt". */
export function drawLabel(
  milli: number,
  stock: SiteStock,
  unit: QuantityUnit,
): string {
  if (milli <= 0 || milli > stock.NEW + stock.GOOD) return "–";
  const { taken } = drawNewFirst(milli, stock);
  const parts: string[] = [];
  if (taken.NEW > 0)
    parts.push(`${formatQuantity(toQuantity(taken.NEW, unit))} Mới`);
  if (taken.GOOD > 0)
    parts.push(`${formatQuantity(toQuantity(taken.GOOD, unit))} Tốt`);
  return parts.join(" · ");
}
