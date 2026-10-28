import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, respond } from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";
import { STOCKTAKE_CODE, approveBody } from "@/lib/stocktakes/respond";
import { approveStocktake } from "@/lib/stocktakes/sessions";

type Params = { code: string };

/** "Duyệt và ghi sổ": posts every difference in one transaction (D9). */
export const POST = withAuth<Params>(
  async (request, { user, params }) => {
    if (!STOCKTAKE_CODE.test(params.code)) return NOT_FOUND();
    const body = await readJson(request, approveBody);
    if (!body.ok) return body.response;
    return respond(
      await approveStocktake(catalogDb(), user, params.code, body.data),
    );
  },
  { permission: "inventory.approve" },
);
