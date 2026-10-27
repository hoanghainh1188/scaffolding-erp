// The M3 order in the shape the client form takes (no Date objects).
import { formatBusinessDate, toBusinessDate } from "@/domain/business-date";
import type { ReceivingLine } from "@/domain/goods-receipt";
import type { Money } from "@/domain/money";
import type { PurchaseKind } from "@/domain/purchase-order";

import type { OrderForReceiving } from "./queries";

/** The order as M3 gets it (serialisable: no Date). */
export interface ReceivingOrder {
  code: string;
  supplierName: string;
  kind: PurchaseKind;
  allocationMethod: "VALUE" | "WEIGHT";
  vehicle: string | null;
  tripNo: number;
  lines: (ReceivingLine & { itemName: string })[];
  prefilledCosts: { label: string; amount: Money }[];
  expectedCosts: Money;
  yards: { id: string; code: string; name: string }[];
  scrapPrice: { pricePerKg: Money; updated: string } | null;
}

export function toReceivingOrder(order: OrderForReceiving): ReceivingOrder {
  return {
    code: order.code,
    supplierName: order.supplierName,
    kind: order.kind,
    allocationMethod: order.allocationMethod,
    vehicle: order.vehicle,
    tripNo: order.tripNo,
    lines: order.lines,
    prefilledCosts: order.prefilledCosts,
    expectedCosts: order.expectedCosts,
    yards: order.yards,
    scrapPrice: order.scrapPrice
      ? {
          pricePerKg: order.scrapPrice.pricePerKg,
          updated: formatBusinessDate(
            toBusinessDate(order.scrapPrice.createdAt),
          ),
        }
      : null,
  };
}
