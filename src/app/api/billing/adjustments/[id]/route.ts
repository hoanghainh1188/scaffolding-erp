// Edit or delete an adjustment while its month is open (billing.manage).
import { withAuth } from "@/lib/auth/guard";
import { deleteAdjustment, updateAdjustment } from "@/lib/billing/adjustments";
import { adjustmentBody, updatedAtBody } from "@/lib/billing/respond";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

export const PUT = withAuth<Params>(
  async (request, { actor, params }) => {
    const body = await readJson(request, adjustmentBody);
    if (!body.ok) return body.response;
    return respond(
      await updateAdjustment(catalogDb(), actor, params.id, body.data),
    );
  },
  { permission: "billing.manage" },
);

export const DELETE = withAuth<Params>(
  async (request, { actor, params }) => {
    const body = await readJson(request, updatedAtBody);
    if (!body.ok) return body.response;
    return respond(
      await deleteAdjustment(catalogDb(), actor, params.id, body.data),
    );
  },
  { permission: "billing.manage" },
);
