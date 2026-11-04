// Shared bits of the exchange routes (site-operations design D10).
import { z } from "zod";

import { deliveryBody } from "@/lib/deliveries/respond";

const id = z.string().max(40);

export const exchangeBody = deliveryBody.extend({
  expected: z
    .array(
      z.object({
        itemId: id.optional(),
        quantity: z.string().max(30).optional(),
      }),
    )
    .max(200)
    .optional(),
});
