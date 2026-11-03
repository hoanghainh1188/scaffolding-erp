// Shared bits of the return and compensation routes (returns-and-compensation
// design D12). Field shapes only: the services hold the rules and messages.
import { z } from "zod";

const id = z.string().max(40);
const quantity = z.string().max(30);
const text = z.string().max(2000);

export const returnBody = z.object({
  clientDraftId: id.optional(),
  contractId: id.optional(),
  yardLocationId: id.optional(),
  vehiclePlate: z.string().max(40).nullable().optional(),
  note: text.nullable().optional(),
  savedOnDeviceAt: z.string().max(40).nullable().optional(),
  lines: z
    .array(
      z.object({
        itemId: id.optional(),
        good: quantity.optional(),
        repair: quantity.optional(),
        scrap: quantity.optional(),
        lost: quantity.optional(),
      }),
    )
    .max(200)
    .optional(),
  photoIds: z.array(id).max(20).optional(),
  exchangeId: id.nullable().optional(),
});

const prices = z
  .array(
    z.object({
      itemId: id.optional(),
      kind: z.string().max(20).optional(),
      unitPrice: z.number().nullable().optional(),
    }),
  )
  .max(400)
  .optional();

export const compensationEditBody = z.object({
  updatedAt: z.string().max(40).optional(),
  prices,
  discountAmount: z.number().optional(),
  discountReason: text.nullable().optional(),
});

export const compensationApproveBody = compensationEditBody.extend({
  approvalReason: text.nullable().optional(),
});

export const compensationRejectBody = z.object({
  updatedAt: z.string().max(40).optional(),
  reason: text.nullable().optional(),
});
