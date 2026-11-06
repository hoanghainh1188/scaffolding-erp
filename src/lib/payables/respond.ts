// Shared bits of the /api/payables routes (payables design D8): body shapes
// and the list query. The services hold the rules and the messages.
import { z } from "zod";

import {
  PAYABLE_FILTERS,
  type PayableFilter,
  type PayableQuery,
} from "./balances";

export { businessToday } from "@/lib/receivables/respond";

export const paymentBody = z.object({
  requestId: z.string().max(40).optional(),
  supplierId: z.string().max(40).optional(),
  kind: z.string().max(20).optional(),
  amount: z.number().optional(),
  method: z.string().max(20).optional(),
  paidDate: z.string().max(10).optional(),
  note: z.string().max(2000).nullable().optional(),
  allocations: z
    .array(
      z.object({
        goodsReceiptId: z.string().max(40).optional(),
        amount: z.number().optional(),
        seen: z.number().optional(),
      }),
    )
    .max(200)
    .optional(),
});

export const cancelBody = z.object({
  reason: z.string().max(2000).nullable().optional(),
});

/** ?filter=owing|overdue|advance|all&q=&page= (D14c URL state). */
export function payableQuery(url: URL): PayableQuery {
  const raw = url.searchParams.get("filter") ?? "owing";
  const filter: PayableFilter = (PAYABLE_FILTERS as readonly string[]).includes(
    raw,
  )
    ? (raw as PayableFilter)
    : "owing";
  const page = Number(url.searchParams.get("page") ?? "1");
  return {
    filter,
    q: (url.searchParams.get("q") ?? "").slice(0, 100),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}
