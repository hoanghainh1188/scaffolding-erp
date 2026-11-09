// Shared bits of the /api/production routes.
import { z } from "zod";

import {
  isProductionStatus,
  type ProductionStatus,
} from "@/domain/production-order";

// Field shapes only: the services hold the rules and the messages.
const quantity = z.string().max(30);
const text = z.string().max(2000);
const id = z.string().max(40);
const stamp = z.string().max(40);

/** LSX-2026-004: anything else can never match. */
export const PRODUCTION_CODE = /^LSX-\d{4}-\d{3,}$/;

export const bomBody = z.object({
  laborRate: z.number().optional(),
  note: text.nullable().optional(),
  materials: z
    .array(z.object({ itemId: id.optional(), quantity: quantity.optional() }))
    .max(200)
    .optional(),
  updatedAt: stamp.optional(),
});

export const scrapItemBody = z.object({ itemId: id.optional() });

export const orderBody = z.object({
  workshopId: id.optional(),
  toLocationId: id.optional(),
  team: text.nullable().optional(),
  note: text.nullable().optional(),
  lines: z
    .array(z.object({ itemId: id.optional(), quantity: quantity.optional() }))
    .max(100)
    .optional(),
  updatedAt: stamp.optional(),
});

export const stepBody = z.object({
  updatedAt: stamp.optional(),
  note: text.nullable().optional(),
  reason: text.nullable().optional(),
});

export const floorBody = z.object({
  draftId: id.optional(),
  updatedAt: stamp.optional(),
  lines: z
    .array(
      z.object({
        itemId: id.optional(),
        finished: quantity.optional(),
        offcutKg: quantity.optional(),
        materials: z
          .array(
            z.object({ itemId: id.optional(), quantity: quantity.optional() }),
          )
          .max(100)
          .optional(),
      }),
    )
    .max(100)
    .optional(),
});

/** ?status=draft|assigned|…|cancelled. */
export function productionStatusFrom(
  value: string | null | undefined,
): ProductionStatus | undefined {
  const status = value?.trim().toUpperCase();
  return isProductionStatus(status) ? status : undefined;
}
