// Shared bits of the /api/receiving routes (goods-receipt design D11).
import { z } from "zod";

import { isBusinessDate, type BusinessDate } from "@/domain/business-date";

// Field shapes only: the service holds the rules and the messages.
const quantity = z.string().max(30);

export const receiptBody = z.object({
  draftId: z.string().max(40).optional(),
  orderCode: z.string().max(30).optional(),
  locationId: z.string().max(40).nullable().optional(),
  arrivedAt: z.string().max(40).nullable().optional(),
  vehicle: z.string().max(200).nullable().optional(),
  lines: z
    .array(
      z.object({
        orderLineId: z.string().max(40).optional(),
        status: z.string().max(20).optional(),
        quantity: quantity.optional(),
        weighedKg: quantity.nullable().optional(),
        split: z
          .object({
            NEW: quantity.optional(),
            GOOD: quantity.optional(),
            NEEDS_REPAIR: quantity.optional(),
            SCRAP: quantity.optional(),
          })
          .optional(),
        awaitsRest: z.boolean().optional(),
      }),
    )
    .max(200)
    .optional(),
  costs: z
    .array(
      z.object({
        label: z.string().max(2000).optional(),
        amount: z.number().optional(),
      }),
    )
    .max(50)
    .optional(),
  confirmedOverrides: z.array(z.string().max(60)).max(250).optional(),
});

export const scrapPriceBody = z.object({
  pricePerKg: z.number().optional(),
  note: z.string().max(2000).nullable().optional(),
});

/** PN-2026-094 / PO-2026-052: anything else can never match. */
export const RECEIPT_CODE = /^PN-\d{4}-\d{3,}$/;
export const ORDER_CODE = /^PO-\d{4}-\d{3,}$/;

/** ?before=2026-10-25&days=7 for M7 "Xem các ngày trước". */
export function pageFrom(url: URL): { before?: BusinessDate; days: number } {
  const before = url.searchParams.get("before") ?? "";
  const days = Number(url.searchParams.get("days") ?? "2");
  return {
    ...(isBusinessDate(before) ? { before } : {}),
    days: Number.isInteger(days) && days > 0 && days <= 31 ? days : 2,
  };
}
