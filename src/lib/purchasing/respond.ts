// Shared bits of the /api/purchasing routes and pages (purchase-orders D10).
import { z } from "zod";

import { PURCHASE_KINDS, type PurchaseKind } from "@/domain/purchase-order";

import { ORDER_TABS, type OrderFilter, type OrderTab } from "./queries";

// Field shapes only: the service holds the rules and the messages.
const text = z.string().max(2000);

export const orderBody = z.object({
  supplierId: z.string().max(40).optional(),
  kind: z.string().max(10).optional(),
  expectedDate: z.string().max(10).nullable().optional(),
  expectedTime: z.string().max(8).nullable().optional(),
  vehicle: text.nullable().optional(),
  note: text.nullable().optional(),
  allocationMethod: z.string().max(10).optional(),
  lines: z
    .array(
      z.object({
        itemId: z.string().max(40).optional(),
        unit: z.string().max(10).optional(),
        quantity: z.string().max(30).optional(),
        unitPrice: z.number().optional(),
      }),
    )
    .max(200)
    .optional(),
  costs: z
    .array(
      z.object({
        label: text.optional(),
        amount: z.number().optional(),
      }),
    )
    .max(50)
    .optional(),
  updatedAt: z.string().max(40).optional(),
});

export const createBody = orderBody.extend({ place: z.boolean().optional() });

export const reasonBody = z.object({ reason: text.nullable().optional() });

/** PO-2026-055: anything else can never match an order. */
export const ORDER_CODE = /^PO-\d{4}-\d{3,}$/;

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function read(params: Params, name: string): string | undefined {
  const value =
    params instanceof URLSearchParams ? params.get(name) : params[name];
  const one = Array.isArray(value) ? value[0] : value;
  return one?.trim() ? one.trim() : undefined;
}

/** D2 filters from the URL: tab, q, kind, page. */
export function orderFilterFrom(params: Params): OrderFilter {
  const tab = read(params, "tab");
  const kind = read(params, "kind");
  const page = Number(read(params, "page") ?? "1");
  return {
    tab: (ORDER_TABS as readonly string[]).includes(tab ?? "")
      ? (tab as OrderTab)
      : "all",
    ...(read(params, "q") ? { q: read(params, "q") } : {}),
    ...((PURCHASE_KINDS as readonly string[]).includes(kind ?? "")
      ? { kind: kind as PurchaseKind }
      : {}),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}
