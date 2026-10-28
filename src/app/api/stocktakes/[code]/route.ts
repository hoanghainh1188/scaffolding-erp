import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb } from "@/lib/catalog/respond";
import { getStocktake } from "@/lib/stocktakes/queries";
import { STOCKTAKE_CODE } from "@/lib/stocktakes/respond";

type Params = { code: string };

/** D13: book at the count, difference, value and flags (office only). */
export const GET = withAuth<Params>(
  async (_request, { params }) => {
    if (!STOCKTAKE_CODE.test(params.code)) return NOT_FOUND();
    const found = await getStocktake(catalogDb(), params.code);
    return found ? ok(found) : NOT_FOUND();
  },
  { permission: "inventory.view" },
);
