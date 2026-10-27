// The receiving part of D3b (goods-receipt design D10): what came in per
// order line over every trip, what the seller is owed and how it compares
// with the order. Each trip's goods value is rounded on its own, as the
// seller bills each delivery (0.2 #13); trip costs never add to it (#26).
import { orderLineAmount } from "./purchase-order";
import {
  receivedInLineUnit,
  type ReceiptLineStatus,
  type ReceivingLine,
} from "./goods-receipt";
import { toMoney, type Money } from "./money";

export interface SummaryOrderLine {
  readonly orderLineId: string;
  readonly itemUnit: ReceivingLine["itemUnit"];
  readonly lineUnit: ReceivingLine["lineUnit"];
  readonly orderedMilli: number;
  readonly unitPrice: Money;
}

export interface SummaryReceiptLine {
  readonly orderLineId: string;
  readonly status: ReceiptLineStatus;
  readonly quantityMilli: number;
  readonly weighedKgMilli: number | null;
  readonly awaitsRest: boolean;
}

export interface SummaryReceipt {
  readonly tripNo: number;
  readonly lines: readonly SummaryReceiptLine[];
  readonly costs: readonly { readonly amount: Money }[];
}

/** Where a line stands: nothing yet, full, over, or short (waiting or not). */
export type LineReceiving =
  "NONE" | "FULL" | "OVER" | "SHORT_WAITING" | "SHORT_CLOSED";

export interface LineSummary {
  readonly orderLineId: string;
  /** Received over every trip, in the line unit. */
  readonly receivedMilli: number;
  readonly state: LineReceiving;
  /** Ordered − received when short, received − ordered when over. */
  readonly gapMilli: number;
  /** Σ goods value of every trip. */
  readonly amount: Money;
  /** amount − ordered value; negative when short. */
  readonly difference: Money;
}

export interface ReceivingSummary {
  readonly trips: number;
  readonly lines: readonly LineSummary[];
  readonly expectedGoods: Money;
  /** Phải trả người bán. */
  readonly payable: Money;
  readonly expectedCosts: Money;
  readonly actualCosts: Money;
  /** Lines still awaited (open and short). */
  readonly waiting: readonly LineSummary[];
}

function lineState(
  ordered: number,
  received: number,
  lastAwaitsRest: boolean | null,
): LineReceiving {
  if (lastAwaitsRest === null) return "NONE";
  if (received > ordered) return "OVER";
  if (received === ordered) return "FULL";
  return lastAwaitsRest ? "SHORT_WAITING" : "SHORT_CLOSED";
}

export function orderReceivingSummary(input: {
  readonly lines: readonly SummaryOrderLine[];
  readonly receipts: readonly SummaryReceipt[];
  readonly expectedCosts: Money;
}): ReceivingSummary {
  const receipts = [...input.receipts].sort((a, b) => a.tripNo - b.tripNo);
  const lines = input.lines.map((orderLine) => {
    let received = 0;
    let amount = 0;
    let last: boolean | null = null;
    for (const receipt of receipts) {
      const line = receipt.lines.find(
        (candidate) => candidate.orderLineId === orderLine.orderLineId,
      );
      if (!line) continue;
      const got = receivedInLineUnit(orderLine, line);
      received += got;
      amount += orderLineAmount(got, orderLine.unitPrice);
      last = line.awaitsRest;
    }
    const ordered = orderLineAmount(
      orderLine.orderedMilli,
      orderLine.unitPrice,
    );
    const state = lineState(orderLine.orderedMilli, received, last);
    return {
      orderLineId: orderLine.orderLineId,
      receivedMilli: received,
      state,
      gapMilli: Math.abs(orderLine.orderedMilli - received),
      amount: toMoney(amount),
      difference: toMoney(state === "NONE" ? 0 : amount - ordered),
    };
  });
  const sum = (values: readonly number[]) =>
    toMoney(values.reduce((total, value) => total + value, 0));
  return {
    trips: receipts.length,
    lines,
    expectedGoods: sum(
      input.lines.map((line) =>
        orderLineAmount(line.orderedMilli, line.unitPrice),
      ),
    ),
    payable: sum(lines.map((line) => line.amount)),
    expectedCosts: input.expectedCosts,
    actualCosts: sum(
      receipts.flatMap((receipt) => receipt.costs.map((cost) => cost.amount)),
    ),
    waiting: lines.filter((line) => line.state === "SHORT_WAITING"),
  };
}
