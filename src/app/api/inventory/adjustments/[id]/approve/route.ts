import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, isUuid, respond } from "@/lib/catalog/respond";
import { approveAdjustment } from "@/lib/inventory/adjustments";

type Params = { id: string };

/** The director approves: the lines go into the ledger now. */
export const POST = withAuth<Params>(
  async (_request, { user, params }) => {
    if (!isUuid(params.id)) return NOT_FOUND();
    return respond(await approveAdjustment(catalogDb(), user, params.id));
  },
  { permission: "inventory.approve" },
);
