import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb } from "@/lib/catalog/respond";
import { countView } from "@/lib/stocktakes/queries";
import { STOCKTAKE_CODE } from "@/lib/stocktakes/respond";

type Params = { code: string };

/** M6: the blind view, without book, cost or difference (design D5). */
export const GET = withAuth<Params>(
  async (_request, { params }) => {
    if (!STOCKTAKE_CODE.test(params.code)) return NOT_FOUND();
    const found = await countView(catalogDb(), params.code);
    return found ? ok(found) : NOT_FOUND();
  },
  { permission: "stocktake.count" },
);
