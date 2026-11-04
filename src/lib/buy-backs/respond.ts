// Shared bits of the buy-back routes (site-operations design D10). Field
// shapes only: the service holds the rules and the messages.
import { z } from "zod";

const id = z.string().max(40);

export const buyBackBody = z.object({
  contractId: id.optional(),
  reason: z.string().max(2000).nullable().optional(),
  lines: z
    .array(
      z.object({
        itemId: id.optional(),
        quantity: z.string().max(30).optional(),
        unitPrice: z.number().nullable().optional(),
      }),
    )
    .max(200)
    .optional(),
  updatedAt: z.string().max(40).optional(),
});

export const decisionBody = z.object({
  updatedAt: z.string().max(40).optional(),
  reason: z.string().max(2000).nullable().optional(),
});
