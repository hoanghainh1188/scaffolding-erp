import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, respond } from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";
import { STOCKTAKE_CODE, reasonBody } from "@/lib/stocktakes/respond";
import { returnStocktake } from "@/lib/stocktakes/sessions";

type Params = { code: string };

/** "Trả lại" with a reason; every count stays (D10). */
export const POST = withAuth<Params>(
  async (request, { actor, params }) => {
    if (!STOCKTAKE_CODE.test(params.code)) return NOT_FOUND();
    const body = await readJson(request, reasonBody);
    if (!body.ok) return body.response;
    return respond(
      await returnStocktake(catalogDb(), actor, params.code, body.data),
    );
  },
  { permission: "inventory.approve" },
);
