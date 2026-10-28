import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, respond } from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";
import { STOCKTAKE_CODE, submitBody } from "@/lib/stocktakes/respond";
import { submitStocktake } from "@/lib/stocktakes/sessions";

type Params = { code: string };

/** "Gửi văn phòng": a repeated submission id answers what it took (D8). */
export const POST = withAuth<Params>(
  async (request, { user, params }) => {
    if (!STOCKTAKE_CODE.test(params.code)) return NOT_FOUND();
    const body = await readJson(request, submitBody);
    if (!body.ok) return body.response;
    return respond(
      await submitStocktake(catalogDb(), user, params.code, body.data),
    );
  },
  { permission: "stocktake.count" },
);
