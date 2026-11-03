import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { deliveryDetail } from "@/lib/deliveries/queries";
import { deliveryBody } from "@/lib/deliveries/respond";
import { updateDelivery } from "@/lib/deliveries/service";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

export const GET = withAuth<Params>(
  async (_request, { user, actor, params }) =>
    respond(
      await deliveryDetail(catalogDb(), contractActor(user, actor), params.id),
    ),
  { permission: "sales.view" },
);

/** A PLANNED note saved again, with the updatedAt it was opened with. */
export const PUT = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, deliveryBody);
    if (!body.ok) return body.response;
    return respond(
      await updateDelivery(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        body.data,
      ),
    );
  },
  { permission: "sales.view" },
);
