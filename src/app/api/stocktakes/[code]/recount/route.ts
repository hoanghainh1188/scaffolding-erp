import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, respond } from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";
import { STOCKTAKE_CODE, recountBody } from "@/lib/stocktakes/respond";
import { requestRecount } from "@/lib/stocktakes/sessions";

type Params = { code: string };

/** "Yêu cầu đếm lại N dòng": back to the phone, the rest stays (D10). */
export const POST = withAuth<Params>(
  async (request, { actor, params }) => {
    if (!STOCKTAKE_CODE.test(params.code)) return NOT_FOUND();
    const body = await readJson(request, recountBody);
    if (!body.ok) return body.response;
    return respond(
      await requestRecount(catalogDb(), actor, params.code, body.data),
    );
  },
  { permission: "inventory.approve" },
);
