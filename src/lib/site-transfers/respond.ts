// Shared bits of the site transfer routes (site-operations design D10).
// Field shapes only: the services hold the rules and the messages.
import { z } from "zod";

const id = z.string().max(40);
const quantity = z.string().max(30);

export const transferBody = z.object({
  fromContractId: id.optional(),
  toContractId: id.optional(),
  lines: z
    .array(z.object({ itemId: id.optional(), quantity: quantity.optional() }))
    .max(200)
    .optional(),
  vehiclePlate: z.string().max(40).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  otherCustomerConfirmed: z.boolean().optional(),
  overContractConfirmed: z.boolean().optional(),
  updatedAt: z.string().max(40).optional(),
  /** "Xác nhận chuyển" before saving: make and post in one go. */
  confirm: z.boolean().optional(),
});

export const versionBody = z.object({
  updatedAt: z.string().max(40).optional(),
});

export const phonePostBody = z.object({
  clientDraftId: id.optional(),
  vehiclePlate: z.string().max(40).nullable().optional(),
  confirmedOnDeviceAt: z.string().max(40).nullable().optional(),
  lines: z
    .array(z.object({ itemId: id.optional(), moved: quantity.optional() }))
    .max(200)
    .optional(),
});
