// What one truck trip costs (goods-receipt design D4, requirements 0.2 #13,
// #25, #26, #27): goods value of each counted line, the trip costs split
// over those lines by the order's method, then each line split over the
// conditions it went into. Pure; the ledger amounts add up to goods + costs.
import { lineAmount } from "./average-cost";
import type { Condition } from "./condition";
import {
  receivedInLineUnit,
  type ReceiptLineInput,
  type ReceivingLine,
} from "./goods-receipt";
import {
  allocate,
  lineWeightKgMilli,
  splitLotByCondition,
  type AllocationMethod,
} from "./landed-cost";
import { toMoney, type Money } from "./money";
import type { PurchaseKind } from "./purchase-order";
import { hasStandardWeight } from "./quantity";

export interface TripLine {
  readonly open: ReceivingLine;
  readonly line: ReceiptLineInput;
  readonly unitPrice: Money;
}

export interface TripCostInput {
  readonly kind: PurchaseKind;
  readonly method: AllocationMethod;
  readonly lines: readonly TripLine[];
  /** Sum of the trip cost lines. */
  readonly costs: Money;
  readonly scrapPricePerKg: Money | null;
}

export interface CostedLine {
  readonly orderLineId: string;
  /** Received quantity × order price (0.2 #13). */
  readonly goods: Money;
  /** Share of the trip costs (0.2 #25). */
  readonly allocated: Money;
  /** Ledger value per condition with stock (#27); sums to goods + allocated. */
  readonly byCondition: Readonly<Partial<Record<Condition, Money>>>;
}

export interface TripCost {
  readonly lines: readonly CostedLine[];
  /** What the seller is owed for this trip; costs are not added (#26). */
  readonly goods: Money;
}

/** Goods value of a receipt line: line-unit quantity × order price. */
export function receiptGoodsAmount(
  open: Pick<ReceivingLine, "itemUnit" | "lineUnit">,
  line: Pick<ReceiptLineInput, "status" | "quantityMilli" | "weighedKgMilli">,
  unitPrice: Money,
): Money {
  return lineAmount(receivedInLineUnit(open, line), unitPrice);
}

/** A posted or posting receipt line with the price of its order line. */
export interface PayableLine {
  readonly open: Pick<ReceivingLine, "itemUnit" | "lineUnit">;
  readonly line: Pick<
    ReceiptLineInput,
    "status" | "quantityMilli" | "weighedKgMilli"
  >;
  readonly unitPrice: Money;
}

/**
 * What the seller is owed for one receipt (payables design D2, 0.2 #13,
 * #26, #99): Σ goods value of its lines, each rounded on its own. The same
 * sum as costTrip's goods and as the receipt's share of D3b's payable.
 */
export function receiptPayable(lines: readonly PayableLine[]): Money {
  return toMoney(
    lines.reduce(
      (sum, { open, line, unitPrice }) =>
        sum + receiptGoodsAmount(open, line, unitPrice),
      0,
    ),
  );
}

/**
 * Weight basis (design D3): quantity × standard weight for a line in the
 * item unit (cái, bó, m...), or the kg weighed for a kg line.
 */
function weightOf(open: ReceivingLine, received: number): number {
  return lineWeightKgMilli(open.lineUnit, received, open.standardWeightKg);
}

/** True when a used lot shares scrap with good or repair units. */
export function needsScrapPrice(
  kind: PurchaseKind,
  lines: readonly Pick<TripLine, "line" | "open">[],
): boolean {
  if (kind !== "USED") return false;
  return lines.some(
    ({ line, open }) =>
      line.status === "COUNTED" &&
      hasStandardWeight(open.itemUnit) &&
      line.split.SCRAP > 0 &&
      line.split.GOOD + line.split.NEEDS_REPAIR > 0,
  );
}

function splitLine(
  input: TripCostInput,
  { open, line }: TripLine,
  total: Money,
): Partial<Record<Condition, Money>> {
  if (input.kind === "NEW") return { NEW: total };
  const split = splitLotByCondition({
    total,
    unit: open.itemUnit,
    standardWeightKg: open.standardWeightKg,
    goodMilli: line.split.GOOD,
    repairMilli: line.split.NEEDS_REPAIR,
    scrapMilli: line.split.SCRAP,
    scrapPricePerKg: input.scrapPricePerKg,
  });
  const out: Partial<Record<Condition, Money>> = {};
  if (line.split.GOOD > 0) out.GOOD = split.GOOD;
  if (line.split.NEEDS_REPAIR > 0) out.NEEDS_REPAIR = split.NEEDS_REPAIR;
  if (line.split.SCRAP > 0) out.SCRAP = split.SCRAP;
  return out;
}

export function costTrip(input: TripCostInput): TripCost {
  const counted = input.lines.filter(({ line }) => line.status === "COUNTED");
  const goods = counted.map(({ open, line, unitPrice }) =>
    receiptGoodsAmount(open, line, unitPrice),
  );
  const allocated = allocate(
    input.costs,
    counted.map(({ open, line }, index) => {
      const received = receivedInLineUnit(open, line);
      return {
        amount: goods[index] ?? toMoney(0),
        weightKgMilli: weightOf(open, received),
        quantityMilli: received,
      };
    }),
    input.method,
  );
  const lines = counted.map((tripLine, index) => {
    const lineGoods = goods[index] ?? toMoney(0);
    const share = allocated[index] ?? toMoney(0);
    return {
      orderLineId: tripLine.line.orderLineId,
      goods: lineGoods,
      allocated: share,
      byCondition: splitLine(input, tripLine, toMoney(lineGoods + share)),
    };
  });
  return { lines, goods: receiptPayable(counted) };
}
