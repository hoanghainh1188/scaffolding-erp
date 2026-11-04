// On-site exchanges (site-operations design D6; 0.2 #68, #72): one delivery
// batch out, the old items back on a linked return note. What may be
// expected back, and the status table of the link. Pure.
import { type SiteStock } from "./condition-split";
import { DomainValueError } from "./errors";
import {
  formatQuantity,
  isCountUnit,
  QUANTITY_UNIT_LABELS,
  toQuantity,
  type QuantityUnit,
} from "./quantity";

export const EXCHANGE_STATUSES = ["WAITING", "DONE", "CANCELLED"] as const;
export type ExchangeStatus = (typeof EXCHANGE_STATUSES)[number];

export const EXCHANGE_STATUS_LABELS: Readonly<Record<ExchangeStatus, string>> =
  {
    WAITING: "Chờ thu hồi",
    DONE: "Đã thu hồi",
    CANCELLED: "Đã bỏ",
  };

const amount = (milli: number, unit: QuantityUnit) =>
  `${formatQuantity(toQuantity(milli, unit))} ${QUANTITY_UNIT_LABELS[unit]}`;

export const EXCHANGE_MESSAGES = {
  notActive: "Chỉ đổi hàng cho hợp đồng thuê đang thực hiện.",
  noExpected:
    "Đổi hàng cần ít nhất một mã nhận về. Chỉ giao thêm thì tạo đợt xuất thường.",
  positive: (code: string) => `${code}: số dự kiến nhận về phải lớn hơn 0.`,
  wholePieces: (code: string, unit: QuantityUnit) =>
    `${code} tính theo ${QUANTITY_UNIT_LABELS[unit]}, số lượng phải là số nguyên`,
  duplicate: (code: string) =>
    `${code} có hai dòng nhận về. Gộp lại thành một dòng.`,
  notOnSite: (code: string, contractCode: string) =>
    `${code} không có ở công trình của hợp đồng ${contractCode}.`,
  tooMany: (
    code: string,
    unit: QuantityUnit,
    expected: number,
    onSite: number,
  ) =>
    `${code}: dự kiến nhận về (${amount(expected, unit)}) nhiều hơn số đang ở công trình (${amount(onSite, unit)}).`,
  otherContract: "Lần đổi hàng không thuộc hợp đồng này.",
  taken: (code: string) => `Lần đổi hàng này đã nhận phiếu thu hồi ${code}.`,
  cancelled: "Lần đổi hàng đã bỏ nên không nối phiếu thu hồi được.",
  notWaiting: "Lần đổi hàng không còn chờ thu hồi.",
  reason: "Bạn ghi lý do bỏ chờ thu hồi.",
  reasonLong: "Lý do tối đa 500 ký tự.",
} as const;

const fail = (message: string): never => {
  throw new DomainValueError(message);
};

export interface ExpectedLine {
  itemId: string;
  itemCode: string;
  unit: QuantityUnit;
  milli: number;
}

/** What may be expected back (design D6): on site, not more than is there. */
export function assertExpectedLines(
  contractCode: string,
  lines: readonly ExpectedLine[],
  onSite: ReadonlyMap<string, SiteStock>,
): ExpectedLine[] {
  if (lines.length === 0) fail(EXCHANGE_MESSAGES.noExpected);
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.milli <= 0) fail(EXCHANGE_MESSAGES.positive(line.itemCode));
    if (isCountUnit(line.unit) && line.milli % 1000 !== 0) {
      fail(EXCHANGE_MESSAGES.wholePieces(line.itemCode, line.unit));
    }
    if (seen.has(line.itemId)) fail(EXCHANGE_MESSAGES.duplicate(line.itemCode));
    seen.add(line.itemId);
    const stock = onSite.get(line.itemId);
    const total = stock ? stock.NEW + stock.GOOD : 0;
    if (total <= 0)
      fail(EXCHANGE_MESSAGES.notOnSite(line.itemCode, contractCode));
    if (line.milli > total) {
      fail(
        EXCHANGE_MESSAGES.tooMany(line.itemCode, line.unit, line.milli, total),
      );
    }
  }
  return [...lines];
}

/** A return note may join only a waiting exchange of its own contract. */
export function assertJoinable(
  exchange: { contractId: string; status: ExchangeStatus },
  contractId: string,
  takenBy: string | null,
): void {
  if (exchange.contractId !== contractId) fail(EXCHANGE_MESSAGES.otherContract);
  if (exchange.status === "DONE") fail(EXCHANGE_MESSAGES.taken(takenBy ?? ""));
  if (exchange.status === "CANCELLED") fail(EXCHANGE_MESSAGES.cancelled);
}

/** "Bỏ chờ thu hồi": a waiting exchange, with a reason. */
export function cancelReason(
  status: ExchangeStatus,
  reason: string | null | undefined,
): string {
  if (status !== "WAITING") fail(EXCHANGE_MESSAGES.notWaiting);
  const text = (reason ?? "").trim();
  if (text.length === 0) fail(EXCHANGE_MESSAGES.reason);
  if (text.length > 500) fail(EXCHANGE_MESSAGES.reasonLong);
  return text;
}
