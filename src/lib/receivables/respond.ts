// Shared bits of the /api/receivables routes (design D7): body shapes and
// the list query. The services hold the rules and the messages.
import { z } from "zod";

import { toBusinessDate, type BusinessDate } from "@/domain/business-date";

import {
  RECEIVABLE_FILTERS,
  type BalanceQuery,
  type ReceivableFilter,
} from "./balances";

export const businessToday = (): BusinessDate => toBusinessDate(new Date());

export const receiptBody = z.object({
  requestId: z.string().max(40).optional(),
  customerId: z.string().max(40).optional(),
  kind: z.string().max(20).optional(),
  contractId: z.string().max(40).nullable().optional(),
  amount: z.number().optional(),
  method: z.string().max(20).optional(),
  receivedDate: z.string().max(10).optional(),
  note: z.string().max(2000).nullable().optional(),
  allocations: z
    .array(
      z.object({
        debtKey: z.string().max(80).optional(),
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

export const settleBody = z.object({
  /** The refund D14b showed: required so a stale screen gets 409. */
  expectedRefund: z.number({
    error: "Thiếu số hoàn cọc đã xem. Bạn tải lại trang thanh lý rồi bấm lại.",
  }),
  refundDate: z.string().max(10).nullable().optional(),
  refundMethod: z.string().max(20).nullable().optional(),
});

/** ?filter=owing|overdue|prepaid|all&q=&page= (D14 URL state). */
export function balanceQuery(url: URL): BalanceQuery {
  const raw = url.searchParams.get("filter") ?? "owing";
  const filter: ReceivableFilter = (
    RECEIVABLE_FILTERS as readonly string[]
  ).includes(raw)
    ? (raw as ReceivableFilter)
    : "owing";
  const page = Number(url.searchParams.get("page") ?? "1");
  return {
    filter,
    q: (url.searchParams.get("q") ?? "").slice(0, 100),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}
