import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, respond } from "@/lib/catalog/respond";
import { approveProductionOrder } from "@/lib/production/orders";
import { PRODUCTION_CODE, stepBody } from "@/lib/production/respond";
import { readJson } from "@/lib/read-json";

type Params = { code: string };

export const POST = withAuth<Params>(
  async (request, { actor, params }) => {
    if (!PRODUCTION_CODE.test(params.code)) return NOT_FOUND();
    const body = await readJson(request, stepBody);
    if (!body.ok) return body.response;
    return respond(
      await approveProductionOrder(catalogDb(), actor, params.code, body.data),
    );
  },
  { permission: "production.approve" },
);
