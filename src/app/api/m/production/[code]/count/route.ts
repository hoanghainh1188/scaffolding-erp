import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, respond } from "@/lib/catalog/respond";
import { countProductionOrder } from "@/lib/production/floor";
import { PRODUCTION_CODE, floorBody } from "@/lib/production/respond";
import { readJson } from "@/lib/read-json";

type Params = { code: string };

/** Answers the state only, no price. */
export const POST = withAuth<Params>(
  async (request, { actor, params }) => {
    if (!PRODUCTION_CODE.test(params.code)) return NOT_FOUND();
    const body = await readJson(request, floorBody);
    if (!body.ok) return body.response;
    return respond(
      await countProductionOrder(catalogDb(), actor, params.code, body.data),
    );
  },
  { permission: "production.count" },
);
