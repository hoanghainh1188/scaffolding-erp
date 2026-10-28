// Shared bits of the /api/stocktakes routes (stocktake design D14).
import { z } from "zod";

import { STOCKTAKE_STATUSES, type StocktakeStatus } from "@/domain/stocktake";

// Field shapes only: the service holds the rules and the messages.
const id = z.string().max(40);
const time = z.string().max(40);
const reason = z.string().max(2000);

export const startBody = z.object({
  clientStartId: id.optional(),
  locationId: id.optional(),
  groupIds: z.array(id).max(200).nullable().optional(),
});

export const submitBody = z.object({
  submissionId: id.optional(),
  deviceNow: time.optional(),
  items: z
    .array(
      z.object({
        itemId: id.optional(),
        startedAt: time.optional(),
        countedAt: time.optional(),
        lines: z
          .array(
            z.object({
              condition: z.string().max(20).optional(),
              quantity: z.string().max(30).optional(),
            }),
          )
          .max(4)
          .optional(),
      }),
    )
    .max(500)
    .optional(),
});

export const approveBody = z.object({
  /** ₫ by stocktake_line id, whole and not negative. */
  unitCosts: z
    .record(
      z.uuid(),
      z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    )
    .optional(),
});

export const recountBody = z.object({
  lineIds: z.array(id).max(1000).optional(),
});

export const reasonBody = z.object({ reason: reason.optional() });

/** KK-2026-003: anything else can never match. */
export const STOCKTAKE_CODE = /^KK-\d{4}-\d{3,}$/;

/** ?status=submitted (any case) of the list. */
export function stocktakeStatusFrom(
  value: string | null | undefined,
): StocktakeStatus | undefined {
  const status = value?.trim().toUpperCase();
  return (STOCKTAKE_STATUSES as readonly string[]).includes(status ?? "")
    ? (status as StocktakeStatus)
    : undefined;
}
