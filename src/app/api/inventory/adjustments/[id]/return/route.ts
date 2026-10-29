import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, isUuid, respond } from "@/lib/catalog/respond";
import { returnAdjustment } from "@/lib/inventory/adjustments";
import { returnBody } from "@/lib/inventory/respond";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

/** The director sends it back to draft, with a reason. */
export const POST = withAuth<Params>(
  async (request, { actor, params }) => {
    if (!isUuid(params.id)) return NOT_FOUND();
    const body = await readJson(request, returnBody);
    if (!body.ok) return body.response;
    return respond(
      await returnAdjustment(catalogDb(), actor, params.id, body.data.reason),
    );
  },
  { permission: "inventory.approve" },
);
