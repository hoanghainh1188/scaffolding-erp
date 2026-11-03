// Shared bits of the delivery routes (deliveries design D12). Field shapes
// only: the services hold the rules and the messages.
import { z } from "zod";

const text = z.string().max(2000);
const id = z.string().max(40);
const quantity = z.string().max(30);

export const deliveryBody = z.object({
  contractId: id.optional(),
  sourceLocationId: id.nullable().optional(),
  plannedDate: z.string().max(10).nullable().optional(),
  kits: z
    .array(z.object({ kitId: id.optional(), quantity: z.number().optional() }))
    .max(50)
    .optional(),
  lines: z
    .array(
      z.object({
        itemId: id.optional(),
        condition: z.string().max(20).nullable().optional(),
        pricingUnit: z.string().max(10).nullable().optional(),
        quantity: quantity.optional(),
      }),
    )
    .max(200)
    .optional(),
  companyTruck: z.boolean().optional(),
  freightAmount: z.number().nullable().optional(),
  vehiclePlate: z.string().max(40).nullable().optional(),
  note: text.nullable().optional(),
  overContractConfirmed: z.boolean().optional(),
  updatedAt: z.string().max(40).optional(),
});

export const postBody = z.object({
  clientDraftId: id.optional(),
  startedVersion: z.string().max(40).optional(),
  departedAt: z.string().max(40).nullable().optional(),
  vehiclePlate: z.string().max(40).nullable().optional(),
  picks: z
    .array(
      z.object({
        lineId: id.optional(),
        condition: z.string().max(20).optional(),
        quantity: quantity.optional(),
        weighedKg: quantity.nullable().optional(),
        piecesEstimated: z.boolean().optional(),
      }),
    )
    .max(400)
    .optional(),
});
