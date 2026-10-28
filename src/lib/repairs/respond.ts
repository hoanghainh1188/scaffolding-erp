// Shared bits of the /api/repairs routes (simple-repair design D10).
import { z } from "zod";

import type { RepairStatus } from "./queries";

// Field shapes only: the service holds the rules and the messages.
const quantity = z.string().max(30);
const text = z.string().max(2000);

export const repairBody = z.object({
  repairDate: z.string().max(10).optional(),
  repairedBy: text.nullable().optional(),
  note: text.nullable().optional(),
  fromLocationId: z.string().max(40).optional(),
  toLocationId: z.string().max(40).optional(),
  lines: z
    .array(
      z.object({
        itemId: z.string().max(40).optional(),
        quantityTaken: quantity.optional(),
        quantityGood: quantity.optional(),
        quantityScrap: quantity.optional(),
        repairCost: z.number().optional(),
      }),
    )
    .max(200)
    .optional(),
  updatedAt: z.string().max(40).optional(),
});

export const postBody = z.object({
  confirmedOverrides: z.array(z.string().max(80)).max(200).optional(),
  updatedAt: z.string().max(40).optional(),
});

/** PSC-2026-024: anything else can never match. */
export const REPAIR_CODE = /^PSC-\d{4}-\d{3,}$/;

/** ?status=draft|posted of the list. */
export function repairStatusFrom(
  value: string | null | undefined,
): RepairStatus | undefined {
  const status = value?.trim().toUpperCase();
  return status === "DRAFT" || status === "POSTED" ? status : undefined;
}
