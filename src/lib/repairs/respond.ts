// Shared bits of the /api/repairs routes (simple-repair design D10).
import { z } from "zod";

import { REPAIR_STATUSES, type RepairStatus } from "./labels";

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

/** ?status=draft|assigned|in_progress|awaiting_check|counted|posted|cancelled. */
export function repairStatusFrom(
  value: string | null | undefined,
): RepairStatus | undefined {
  const status = value?.trim().toUpperCase();
  return (REPAIR_STATUSES as readonly string[]).includes(status ?? "")
    ? (status as RepairStatus)
    : undefined;
}

/** A work order: workshop, where the stock comes from, team, lines. */
export const workOrderBody = z.object({
  workshopId: z.string().max(40).optional(),
  fromLocationId: z.string().max(40).optional(),
  repairedBy: text.nullable().optional(),
  note: text.nullable().optional(),
  lines: z
    .array(
      z.object({
        itemId: z.string().max(40).optional(),
        quantityTaken: quantity.optional(),
      }),
    )
    .max(200)
    .optional(),
  updatedAt: z.string().max(40).optional(),
});

/** Assign, recall, return, cancel: the updatedAt seen and a reason. */
export const stepBody = z.object({
  updatedAt: z.string().max(40).optional(),
  reason: z.string().max(2000).nullable().optional(),
});

/** Phone steps: receive (no lines), report and count (lines). */
export const floorBody = z.object({
  draftId: z.string().max(40).optional(),
  updatedAt: z.string().max(40).optional(),
  lines: z
    .array(
      z.object({
        itemId: z.string().max(40).optional(),
        good: quantity.optional(),
        scrap: quantity.optional(),
        materials: z
          .array(
            z.object({
              itemId: z.string().max(40).optional(),
              quantity: quantity.optional(),
            }),
          )
          .max(50)
          .optional(),
      }),
    )
    .max(200)
    .optional(),
});

/** The shape of a simple slip (typed cost): no longer created (0.2 số 121). */
export function isSimpleSlipBody(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const value = body as Record<string, unknown>;
  const lines = Array.isArray(value.lines) ? value.lines : [];
  return (
    value.workshopId === undefined &&
    (value.toLocationId !== undefined ||
      value.repairDate !== undefined ||
      lines.some(
        (line) =>
          typeof line === "object" &&
          line !== null &&
          "repairCost" in (line as object),
      ))
  );
}
