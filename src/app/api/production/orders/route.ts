import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { createProductionOrder } from "@/lib/production/orders";
import { listProductionOrders } from "@/lib/production/queries";
import { orderBody, productionStatusFrom } from "@/lib/production/respond";
import { readJson } from "@/lib/read-json";

export const GET = withAuth(
  async (request) => {
    const status = productionStatusFrom(
      new URL(request.url).searchParams.get("status"),
    );
    return ok(await listProductionOrders(catalogDb(), { status }));
  },
  { permission: "production.view" },
);

export const POST = withAuth(
  async (request, { actor }) => {
    const body = await readJson(request, orderBody);
    if (!body.ok) return body.response;
    return respond(
      await createProductionOrder(catalogDb(), actor, body.data),
      201,
    );
  },
  { permission: "production.manage" },
);
