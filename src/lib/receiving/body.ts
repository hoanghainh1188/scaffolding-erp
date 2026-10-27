// The receipt the phone sends (goods-receipt design D11), read into domain
// values. Shapes only: the rules live in src/domain/goods-receipt.ts.
import { CONDITIONS } from "@/domain/condition";
import {
  RECEIPT_LINE_STATUSES,
  type ReceiptLineInput,
  type ReceiptLineStatus,
} from "@/domain/goods-receipt";
import { PurchaseFieldError } from "@/domain/purchase-order";
import { quantityFromDb } from "@/domain/quantity";
import { optionalText } from "@/lib/catalog/common";

export interface ReceiptLineBody {
  orderLineId?: string;
  status?: string;
  /** numeric(14,3) text in the item unit: "196", "1250.5". */
  quantity?: string;
  weighedKg?: string | null;
  split?: Partial<Record<(typeof CONDITIONS)[number], string>>;
  awaitsRest?: boolean;
}

export interface ReceiptBody {
  /** Made on the phone when the draft starts (design D1). */
  draftId?: string;
  orderCode?: string;
  locationId?: string | null;
  arrivedAt?: string | null;
  vehicle?: string | null;
  lines?: ReceiptLineBody[];
  costs?: { label?: string; amount?: number }[];
  /** Anomaly keys the storekeeper confirmed (design D5b). */
  confirmedOverrides?: string[];
}

export const BODY_MESSAGES = {
  draftId: "Mã nháp không hợp lệ",
  quantity: "Số lượng không hợp lệ",
  status: 'Chọn "Đã đếm" hoặc "Chuyến này không có"',
  arrivedAt: "Giờ về không hợp lệ",
  vehicleTooLong: "Xe dài tối đa 100 ký tự",
  tooManyCosts: "Chuyến tối đa 20 khoản chi phí",
  tooManyLines: "Phiếu tối đa 100 dòng",
} as const;

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LINES = 100;
export const MAX_COSTS = 20;

const fieldError = (message: string, field: string) =>
  new PurchaseFieldError(message, field);

function milliOf(value: string | null | undefined, field: string): number {
  const text = (value ?? "").trim();
  if (text === "") return 0;
  try {
    // Three decimals for both units; whole pieces are a domain rule.
    const milli = quantityFromDb(text, "KG").milli;
    if (milli < 0) throw new Error("negative");
    return milli;
  } catch {
    throw fieldError(BODY_MESSAGES.quantity, field);
  }
}

export function readDraftId(body: ReceiptBody): string {
  const id = body.draftId ?? "";
  if (!UUID.test(id)) throw fieldError(BODY_MESSAGES.draftId, "draftId");
  return id.toLowerCase();
}

export function readLines(body: ReceiptBody): ReceiptLineInput[] {
  const raw = body.lines ?? [];
  if (raw.length > MAX_LINES) {
    throw fieldError(BODY_MESSAGES.tooManyLines, "lines");
  }
  return raw.map((line, index) => {
    const field = `lines.${index}`;
    if (
      !(RECEIPT_LINE_STATUSES as readonly string[]).includes(line.status ?? "")
    ) {
      throw fieldError(BODY_MESSAGES.status, `${field}.status`);
    }
    const weighed = optionalText(line.weighedKg);
    return {
      orderLineId: line.orderLineId ?? "",
      status: line.status as ReceiptLineStatus,
      quantityMilli: milliOf(line.quantity, `${field}.quantity`),
      weighedKgMilli:
        weighed === null ? null : milliOf(weighed, `${field}.weighedKg`),
      split: {
        NEW: milliOf(line.split?.NEW, `${field}.split`),
        GOOD: milliOf(line.split?.GOOD, `${field}.split`),
        NEEDS_REPAIR: milliOf(line.split?.NEEDS_REPAIR, `${field}.split`),
        SCRAP: milliOf(line.split?.SCRAP, `${field}.split`),
      },
      awaitsRest: line.awaitsRest === true,
    };
  });
}

export function readCosts(body: ReceiptBody) {
  const raw = body.costs ?? [];
  if (raw.length > MAX_COSTS) {
    throw fieldError(BODY_MESSAGES.tooManyCosts, "costs");
  }
  return raw.map((cost) => ({
    label: cost.label ?? "",
    amount: cost.amount ?? 0,
  }));
}

/** Arrival time from the phone; a clock ahead of the server is cut back. */
export function readArrivedAt(body: ReceiptBody, now: Date): Date | null {
  const text = optionalText(body.arrivedAt);
  if (text === null) return null;
  const time = Date.parse(text);
  if (Number.isNaN(time)) {
    throw fieldError(BODY_MESSAGES.arrivedAt, "arrivedAt");
  }
  return new Date(Math.min(time, now.getTime()));
}

export function readVehicle(body: ReceiptBody): string | null {
  const text = optionalText(body.vehicle);
  if (text && text.length > 100) {
    throw fieldError(BODY_MESSAGES.vehicleTooLong, "vehicle");
  }
  return text;
}
