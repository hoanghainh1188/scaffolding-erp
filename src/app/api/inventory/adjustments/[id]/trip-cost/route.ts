import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, isUuid, respond } from "@/lib/catalog/respond";
import { tripAdjustmentBody } from "@/lib/inventory/respond";
import { updateTripAdjustment } from "@/lib/inventory/trip-adjustments";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

/** Drafts only: a new corrected cost or reason; the lines are built again. */
export const PATCH = withAuth<Params>(
  async (request, { actor, params }) => {
    if (!isUuid(params.id)) return NOT_FOUND();
    const body = await readJson(request, tripAdjustmentBody);
    if (!body.ok) return body.response;
    return respond(
      await updateTripAdjustment(catalogDb(), actor, params.id, body.data),
    );
  },
  { permission: "inventory.adjust" },
);
