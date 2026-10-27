import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, isUuid, respond } from "@/lib/catalog/respond";
import { submitAdjustment } from "@/lib/inventory/adjustments";

type Params = { id: string };

/** Draft → waiting for the director. */
export const POST = withAuth<Params>(
  async (_request, { user, params }) => {
    if (!isUuid(params.id)) return NOT_FOUND();
    return respond(await submitAdjustment(catalogDb(), user, params.id));
  },
  { permission: "inventory.adjust" },
);
