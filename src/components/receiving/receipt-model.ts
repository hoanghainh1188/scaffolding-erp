// The M3 form as it lives in a phone draft (goods-receipt design D1, D6,
// D12) and what it turns into: domain lines for the checks, and the body
// the server takes. Pure, so the rules can be tested without a browser.
import {
  EMPTY_SPLIT,
  needsWeighing,
  type ReceiptLineInput,
  type ReceivingLine,
} from "@/domain/goods-receipt";
import {
  formatQuantity,
  hasStandardWeight,
  QUANTITY_UNIT_LABELS,
  quantityToDb,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import {
  receiptAnomalies,
  unconfirmedAnomalies,
  type Anomaly,
} from "@/domain/receipt-anomalies";
import type { Money } from "@/domain/money";
import type { PurchaseKind } from "@/domain/purchase-order";
import type { ReceiptBody } from "@/lib/receiving/body";
import type { ReceivingOrder } from "@/lib/receiving/receiving-order";

export type { ReceivingOrder };

export type LineMode = "PENDING" | "COUNTED" | "NOT_IN_TRIP";

export interface LineForm {
  orderLineId: string;
  mode: LineMode;
  /** In the item unit, thousandths. */
  quantityMilli: number;
  /** Kg weighed (kg line of a piece item), thousandths; 0 = not yet. */
  weighedKgMilli: number;
  /** Tốt / Chờ sửa / Phế liệu of a used piece item, thousandths. */
  good: number;
  repair: number;
  scrap: number;
  /** null: the default for the mode (design D6, 0.2 #12, #29). */
  awaitsRest: boolean | null;
}

export interface CostForm {
  label: string;
  /** As typed: "3500000" or "3.500.000". */
  amount: string;
}

/** Whole đồng from what was typed; anything else counts as 0. */
export function costAmount(cost: CostForm): number {
  const digits = cost.amount.replace(/[.\s₫đ]/g, "");
  return /^\d+$/.test(digits) ? Number(digits) : 0;
}

export interface ReceiptForm {
  orderCode: string;
  locationId: string | null;
  vehicle: string;
  /** When the draft was opened on the phone ("về lúc 09:34"). */
  arrivedAt: string;
  lines: LineForm[];
  costs: CostForm[];
  /** Anomaly keys answered "Đúng" (design D5b). */
  confirmed: string[];
}

export interface ReceiptDraftPayload {
  form: ReceiptForm;
  /** Set when "Xác nhận nhập kho" is pressed; what the outbox sends. */
  body: ReceiptBody | null;
}

export function initialForm(order: ReceivingOrder, now: Date): ReceiptForm {
  return {
    orderCode: order.code,
    locationId: order.yards.length === 1 ? (order.yards[0]?.id ?? null) : null,
    vehicle: order.vehicle ?? "",
    arrivedAt: now.toISOString(),
    lines: order.lines.map((line) => ({
      orderLineId: line.orderLineId,
      mode: "PENDING",
      quantityMilli: 0,
      weighedKgMilli: 0,
      good: 0,
      repair: 0,
      scrap: 0,
      awaitsRest: null,
    })),
    costs: order.prefilledCosts.map((cost) => ({
      label: cost.label,
      amount: String(cost.amount),
    })),
    confirmed: [],
  };
}

/** Lines of a new trip that the order no longer has drop out; new ones come in. */
export function alignForm(
  form: ReceiptForm,
  order: ReceivingOrder,
): ReceiptForm {
  const fresh = initialForm(order, new Date(form.arrivedAt));
  return {
    ...form,
    lines: fresh.lines.map(
      (line) =>
        form.lines.find((old) => old.orderLineId === line.orderLineId) ?? line,
    ),
  };
}

/**
 * A used item with a standard weight (cái, bó, m...) is split over
 * conditions; a kg item goes to Phế liệu and new goods to Mới.
 */
export function isSplit(kind: PurchaseKind, line: ReceivingLine): boolean {
  return kind === "USED" && hasStandardWeight(line.itemUnit);
}

export function awaitsRestOf(line: LineForm): boolean {
  return line.awaitsRest ?? line.mode === "NOT_IN_TRIP";
}

/** What the trip brings for this line, in the line unit. */
export function receivedOf(open: ReceivingLine, line: LineForm): number {
  if (line.mode !== "COUNTED") return 0;
  return needsWeighing(open) ? line.weighedKgMilli : line.quantityMilli;
}

/** Left on the order after this trip, in the line unit (negative = extra). */
export function shortAfter(open: ReceivingLine, line: LineForm): number {
  return open.orderedMilli - open.receivedMilli - receivedOf(open, line);
}

export function lineDone(
  kind: PurchaseKind,
  open: ReceivingLine,
  line: LineForm,
): boolean {
  if (line.mode === "NOT_IN_TRIP") return true;
  if (line.mode !== "COUNTED" || line.quantityMilli <= 0) return false;
  if (needsWeighing(open) && line.weighedKgMilli <= 0) return false;
  if (!isSplit(kind, open)) return true;
  return line.good + line.repair + line.scrap === line.quantityMilli;
}

export function progressText(order: ReceivingOrder, form: ReceiptForm): string {
  const done = order.lines.filter((open, index) => {
    const line = form.lines[index];
    return line !== undefined && lineDone(order.kind, open, line);
  }).length;
  return `${done}/${order.lines.length} mã xong`;
}

/** "Đếm Mâm giàn giáo 1,6m hoặc chọn …": the first line still to do. */
export function confirmHint(
  order: ReceivingOrder,
  form: ReceiptForm,
): string | null {
  const index = order.lines.findIndex((open, i) => {
    const line = form.lines[i];
    return !line || !lineDone(order.kind, open, line);
  });
  if (index < 0) {
    if (!form.lines.some((line) => line.mode === "COUNTED")) {
      return "Chuyến này chưa nhận mã nào";
    }
    if (!form.locationId) return "Chọn bãi nhập hàng";
    return null;
  }
  const open = order.lines[index];
  const line = form.lines[index];
  if (line?.mode === "COUNTED" && open) {
    return `Chia đủ tình trạng cho ${open.itemName} để xác nhận`;
  }
  return `Đếm ${open?.itemName} hoặc chọn "Chuyến này không có" để xác nhận`;
}

function splitOf(kind: PurchaseKind, open: ReceivingLine, line: LineForm) {
  if (line.mode !== "COUNTED") return EMPTY_SPLIT;
  if (kind === "NEW") return { ...EMPTY_SPLIT, NEW: line.quantityMilli };
  if (!isSplit(kind, open)) {
    return { ...EMPTY_SPLIT, SCRAP: line.quantityMilli };
  }
  return {
    NEW: 0,
    GOOD: line.good,
    NEEDS_REPAIR: line.repair,
    SCRAP: line.scrap,
  };
}

/** The lines as the domain checks see them (same order as the order). */
export function toInputs(
  order: ReceivingOrder,
  form: ReceiptForm,
): ReceiptLineInput[] {
  return order.lines.flatMap((open, index) => {
    const line = form.lines[index];
    if (!line || line.mode === "PENDING") return [];
    const counted = line.mode === "COUNTED";
    return [
      {
        orderLineId: open.orderLineId,
        status: counted ? "COUNTED" : "NOT_IN_TRIP",
        quantityMilli: counted ? line.quantityMilli : 0,
        weighedKgMilli:
          counted && needsWeighing(open) ? line.weighedKgMilli : null,
        split: splitOf(order.kind, open, line),
        awaitsRest: awaitsRestOf(line),
      },
    ];
  });
}

export function tripCostTotal(form: ReceiptForm): number {
  return form.costs.reduce((sum, cost) => sum + costAmount(cost), 0);
}

/** Points still to confirm before sending (design D5b). */
export function pendingAnomalies(
  order: ReceivingOrder,
  form: ReceiptForm,
): Anomaly[] {
  const inputs = toInputs(order, form);
  const byId = new Map(order.lines.map((line) => [line.orderLineId, line]));
  const found = receiptAnomalies({
    lines: inputs.map((line) => ({
      open: byId.get(line.orderLineId) as ReceivingLine,
      line,
    })),
    tripCosts: tripCostTotal(form) as Money,
    expectedCosts: order.expectedCosts,
  });
  return unconfirmedAnomalies(found, form.confirmed);
}

const db = (milli: number) => quantityToDb(toQuantity(milli, "KG"));

export function toBody(order: ReceivingOrder, form: ReceiptForm): ReceiptBody {
  return {
    orderCode: order.code,
    locationId: form.locationId,
    arrivedAt: form.arrivedAt,
    vehicle: form.vehicle,
    lines: toInputs(order, form).map((line) => ({
      orderLineId: line.orderLineId,
      status: line.status,
      quantity: db(line.quantityMilli),
      weighedKg: line.weighedKgMilli === null ? null : db(line.weighedKgMilli),
      split: {
        NEW: db(line.split.NEW),
        GOOD: db(line.split.GOOD),
        NEEDS_REPAIR: db(line.split.NEEDS_REPAIR),
        SCRAP: db(line.split.SCRAP),
      },
      awaitsRest: line.awaitsRest,
    })),
    costs: form.costs.map((cost) => ({
      label: cost.label,
      amount: costAmount(cost),
    })),
    confirmedOverrides: form.confirmed,
  };
}

/** "196 cái", "1.250,5 kg". */
export function quantityText(milli: number, unit: QuantityUnit): string {
  return `${formatQuantity(toQuantity(milli, unit))} ${QUANTITY_UNIT_LABELS[unit]}`;
}

/** Changing a count drops its earlier "Đúng" (must be confirmed again). */
export function withoutConfirmation(
  form: ReceiptForm,
  key: string,
): ReceiptForm {
  return { ...form, confirmed: form.confirmed.filter((one) => one !== key) };
}
