import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, isUuid, respond } from "@/lib/catalog/respond";
import { submitAdjustment } from "@/lib/inventory/adjustments";

type Params = { id: string };

/** Draft → waiting for the director. */
export const POST = withAuth<Params>(
  async (_request, { actor, params }) => {
    if (!isUuid(params.id)) return NOT_FOUND();
    return respond(await submitAdjustment(catalogDb(), actor, params.id));
  },
  { permission: "inventory.adjust" },
);
