import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { tripAdjustmentBody } from "@/lib/inventory/respond";
import { createTripAdjustment } from "@/lib/inventory/trip-adjustments";
import { readJson } from "@/lib/read-json";

/** A trip-cost fix of a goods receipt: the lines are built (design D4). */
export const POST = withAuth(
  async (request, { actor }) => {
    const body = await readJson(request, tripAdjustmentBody);
    if (!body.ok) return body.response;
    return respond(
      await createTripAdjustment(catalogDb(), actor, body.data),
      201,
    );
  },
  { permission: "inventory.adjust" },
);
