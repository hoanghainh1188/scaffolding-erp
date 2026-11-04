// Buy-back notes (site-operations design D5; 0.2 #67, #71): what a customer
// may buy of what is rented at its site, the price prefilled from the lost
// price of the contract, the total, the due date and the status table. Pure:
// the service reads stock and terms, then calls these.
import { lineAmount } from "./average-cost";
import { addDays, type BusinessDate } from "./business-date";
import { type Condition } from "./condition";
import {
  drawNewFirst,
  SITE_DRAW_ORDER,
  type SiteStock,
} from "./condition-split";
import { DomainValueError } from "./errors";
import { formatMoney, toMoney, type Money } from "./money";
import type { MovementDraft } from "./movement";
import {
  formatQuantity,
  isCountUnit,
  QUANTITY_UNIT_LABELS,
  toQuantity,
  type QuantityUnit,
} from "./quantity";

export const BUY_BACK_PREFIX = "MLA";
export const BUY_BACK_REASON_MAX = 500;

export const BUY_BACK_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type BuyBackStatus = (typeof BUY_BACK_STATUSES)[number];

export const BUY_BACK_STATUS_LABELS: Readonly<Record<BuyBackStatus, string>> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối",
};

const amount = (milli: number, unit: QuantityUnit) =>
  `${formatQuantity(toQuantity(milli, unit))} ${QUANTITY_UNIT_LABELS[unit]}`;

export const BUY_BACK_MESSAGES = {
  notRental: "Chỉ mua lại hàng đang thuê của hợp đồng thuê đang thực hiện.",
  reason: "Bạn ghi lý do khách mua lại.",
  reasonLong: `Lý do tối đa ${BUY_BACK_REASON_MAX} ký tự.`,
  noLines: "Phiếu mua lại chưa có hàng nào. Nhập số mua của ít nhất một mã.",
  positive: (code: string) => `${code}: số mua phải lớn hơn 0.`,
  wholePieces: (code: string, unit: QuantityUnit) =>
    `${code} tính theo ${QUANTITY_UNIT_LABELS[unit]}, số lượng phải là số nguyên`,
  duplicate: (code: string) =>
    `${code} có hai dòng trên phiếu. Gộp lại thành một dòng.`,
  notOnSite: (code: string, contractCode: string) =>
    `${code} không có ở công trình của hợp đồng ${contractCode}.`,
  tooMany: (
    code: string,
    unit: QuantityUnit,
    boughtMilli: number,
    onSiteMilli: number,
  ) =>
    `${code}: số mua (${amount(boughtMilli, unit)}) nhiều hơn số đang ở công trình (${amount(onSiteMilli, unit)}).`,
  tooManyAtApproval: (
    code: string,
    unit: QuantityUnit,
    boughtMilli: number,
    onSiteMilli: number,
  ) =>
    `${code}: số mua (${amount(boughtMilli, unit)}) nhiều hơn số đang ở công trình (${amount(onSiteMilli, unit)}). Kinh doanh cần sửa phiếu.`,
  noPrice: (code: string) =>
    `${code} chưa có giá mất trên hợp đồng. Bạn nhập đơn giá mua lại.`,
  badPrice: "Đơn giá mua lại phải là số tiền không âm.",
  rejectReason: "Bạn cần ghi lý do từ chối.",
  overdueReason: (debt: number, days: number) =>
    `Nhà thầu đang nợ quá hạn ${formatMoney(toMoney(debt))} (${days} ngày). Bạn cần ghi lý do duyệt.`,
  approved: "Phiếu mua lại đã duyệt nên không sửa được.",
  rejected: "Phiếu mua lại đã từ chối nên không sửa được.",
  approvedBy: (code: string) => `Phiếu ${code} đã được duyệt.`,
  stale: "Phiếu vừa được người khác sửa. Bạn tải lại để xem bản mới.",
} as const;

const fail = (message: string): never => {
  throw new DomainValueError(message);
};

export type BuyBackCommand = "EDIT" | "APPROVE" | "REJECT";

/** Only a pending note changes; approved and rejected are final. */
export function transition(
  status: BuyBackStatus,
  command: BuyBackCommand,
): BuyBackStatus {
  if (status === "APPROVED") return fail(BUY_BACK_MESSAGES.approved);
  if (status === "REJECTED") return fail(BUY_BACK_MESSAGES.rejected);
  if (command === "APPROVE") return "APPROVED";
  if (command === "REJECT") return "REJECTED";
  return "PENDING";
}

/** A required reason, trimmed, at most 500 characters. */
export function requireBuyBackText(
  value: string | null | undefined,
  missing: string,
): string {
  const text = (value ?? "").trim();
  if (text.length === 0) fail(missing);
  if (text.length > BUY_BACK_REASON_MAX) fail(BUY_BACK_MESSAGES.reasonLong);
  return text;
}

export interface BuyBackLineInput {
  itemId: string;
  itemCode: string;
  unit: QuantityUnit;
  milli: number;
  /** Null when the office left it empty. */
  unitPrice: number | null;
  /** The lost price on the contract; null when it has none. */
  contractPrice: number | null;
}

const siteTotal = (stock: SiteStock | undefined) =>
  stock ? stock.NEW + stock.GOOD : 0;

/**
 * The lines a note may hold (design D5): more than 0, whole pieces, only
 * items at the site and never more than is there, a price ≥ 0 on each.
 * `atApproval` words the over-stock refusal for the director.
 */
export function assertBuyBackLines(
  contractCode: string,
  lines: readonly BuyBackLineInput[],
  onSite: ReadonlyMap<string, SiteStock>,
  atApproval = false,
): BuyBackLineInput[] {
  if (lines.length === 0) fail(BUY_BACK_MESSAGES.noLines);
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.milli <= 0) fail(BUY_BACK_MESSAGES.positive(line.itemCode));
    if (isCountUnit(line.unit) && line.milli % 1000 !== 0) {
      fail(BUY_BACK_MESSAGES.wholePieces(line.itemCode, line.unit));
    }
    if (seen.has(line.itemId)) fail(BUY_BACK_MESSAGES.duplicate(line.itemCode));
    seen.add(line.itemId);
    const stock = siteTotal(onSite.get(line.itemId));
    if (stock <= 0) {
      fail(BUY_BACK_MESSAGES.notOnSite(line.itemCode, contractCode));
    }
    if (line.milli > stock) {
      const message = atApproval
        ? BUY_BACK_MESSAGES.tooManyAtApproval
        : BUY_BACK_MESSAGES.tooMany;
      fail(message(line.itemCode, line.unit, line.milli, stock));
    }
    if (line.unitPrice === null) fail(BUY_BACK_MESSAGES.noPrice(line.itemCode));
    if (!Number.isInteger(line.unitPrice) || (line.unitPrice ?? 0) < 0) {
      fail(BUY_BACK_MESSAGES.badPrice);
    }
  }
  return [...lines];
}

export interface PricedBuyBackLine {
  milli: number;
  unitPrice: number;
}

export const buyBackLineAmount = (line: PricedBuyBackLine): Money =>
  lineAmount(line.milli, toMoney(line.unitPrice));

export function buyBackTotal(lines: readonly PricedBuyBackLine[]): Money {
  return toMoney(lines.reduce((sum, line) => sum + buyBackLineAmount(line), 0));
}

/** "khác giá hợp đồng": a price that is not the contract's lost price. */
export const isOffContractPrice = (
  line: Pick<BuyBackLineInput, "unitPrice" | "contractPrice">,
): boolean =>
  line.contractPrice === null || line.unitPrice !== line.contractPrice;

/** Hạn trả = ngày duyệt + số ngày được nợ (0.2 #18). */
export const buyBackDueDate = (
  approvedDate: BusinessDate,
  paymentTermsDays: number,
): BusinessDate => addDays(approvedDate, paymentTermsDays);

/** SALE_OUT lines at the site for one item, Mới first (design D5). */
export function allocateBuyBack(input: {
  code: string;
  siteLocationId: string;
  itemId: string;
  milli: number;
  onSite: SiteStock;
}): MovementDraft[] {
  const { taken } = drawNewFirst(input.milli, input.onSite);
  return SITE_DRAW_ORDER.filter((source) => taken[source] > 0).map((source) => {
    const condition: Condition = source;
    return {
      itemId: input.itemId,
      condition,
      locationId: input.siteLocationId,
      movement: "SALE_OUT",
      quantityMilli: -taken[source],
      description: `${input.code}: Khách mua lại ở công trình`,
    };
  });
}
