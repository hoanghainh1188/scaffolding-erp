// Shared bits of the /api/inventory routes and pages (inventory-ledger D13).
import { z } from "zod";

import {
  isBusinessDate,
  monthRange,
  toBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";
import { CONDITIONS, type Condition } from "@/domain/condition";
import { REVALUE_MESSAGES } from "@/domain/stock-revaluation";

import { CARD_PLACES, type CardFilter, type CardPlace } from "./card";

const text = z.string().max(2000);

export const adjustmentLineBody = z.object({
  lineType: z.string().max(20).optional(),
  itemId: z.string().max(40).optional(),
  condition: z.string().max(20).optional(),
  toCondition: z.string().max(20).nullable().optional(),
  locationId: z.string().max(40).optional(),
  toLocationId: z.string().max(40).nullable().optional(),
  quantity: z.string().max(30).optional(),
  unitCost: z.number().nullable().optional(),
  valueDelta: z
    .number()
    .int({ message: REVALUE_MESSAGES.deltaWhole })
    .nullable()
    .optional(),
});

export const adjustmentBody = z.object({
  kind: z.string().max(20).optional(),
  reason: text.optional(),
  relatedDocumentCode: text.nullable().optional(),
  openingDate: z.string().max(10).nullable().optional(),
  lines: z.array(adjustmentLineBody).max(200).optional(),
  updatedAt: z.string().max(40).nullable().optional(),
});

/** Trip-cost fix of a goods receipt (stock-value-adjustment design D6). */
export const tripAdjustmentBody = z.object({
  receiptId: z.string().max(40).optional(),
  correctedTripCost: z
    .number({ message: REVALUE_MESSAGES.tripCost })
    .int({ message: REVALUE_MESSAGES.tripCost })
    .min(0, { message: REVALUE_MESSAGES.tripCost }),
  reason: text.optional(),
  updatedAt: z.string().max(40).nullable().optional(),
});

/** ?itemId=&condition=&valueDelta= of the value preview. */
export function revaluePreviewFrom(params: Params): {
  itemId: string;
  condition: Condition;
  valueDelta: number;
} | null {
  const itemId = read(params, "itemId");
  const condition = read(params, "condition");
  const valueDelta = Number(read(params, "valueDelta"));
  if (
    !itemId ||
    !/^[0-9a-f-]{36}$/i.test(itemId) ||
    !(CONDITIONS as readonly string[]).includes(condition ?? "") ||
    !Number.isSafeInteger(valueDelta)
  ) {
    return null;
  }
  return { itemId, condition: condition as Condition, valueDelta };
}

export const returnBody = z.object({ reason: text.optional() });

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function read(params: Params, name: string): string | undefined {
  const value =
    params instanceof URLSearchParams ? params.get(name) : params[name];
  const one = Array.isArray(value) ? value[0] : value;
  return one?.trim() ? one.trim() : undefined;
}

/**
 * D11 filters from the URL: condition (default Tốt, "all" for every one),
 * place (default yard), one site, period (default this month in Vietnam).
 */
export function cardFilterFrom(
  params: Params,
  today?: BusinessDate,
): CardFilter {
  const condition = read(params, "condition");
  const place = read(params, "place");
  const from = read(params, "from");
  const to = read(params, "to");
  const given = from && to && isBusinessDate(from) && isBusinessDate(to);
  // Only read the clock when the URL has no period.
  const month = given
    ? { from, to }
    : monthRange(today ?? toBusinessDate(new Date()));
  const chosen: Condition | null =
    condition === "all"
      ? null
      : (CONDITIONS as readonly string[]).includes(condition ?? "")
        ? (condition as Condition)
        : "GOOD";
  const site = read(params, "site");
  return {
    condition: chosen,
    place: (CARD_PLACES as readonly string[]).includes(place ?? "")
      ? (place as CardPlace)
      : "yard",
    ...(site ? { siteCode: site } : {}),
    from: from && isBusinessDate(from) ? from : month.from,
    to: to && isBusinessDate(to) ? to : month.to,
  };
}

/** ?status= of the adjustments list. */
export function adjustmentStatusFrom(params: Params) {
  const status = read(params, "status");
  return status === "DRAFT" ||
    status === "PENDING_APPROVAL" ||
    status === "DONE"
    ? status
    : undefined;
}
