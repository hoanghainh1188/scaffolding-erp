import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";
import { listStocktakes } from "@/lib/stocktakes/queries";
import { startBody, stocktakeStatusFrom } from "@/lib/stocktakes/respond";
import { startStocktake } from "@/lib/stocktakes/sessions";

// Office roles read D13; the storekeeper (and director) start on M6a (D11).
export const GET = withAuth(
  async (request) => {
    const status = stocktakeStatusFrom(
      new URL(request.url).searchParams.get("status"),
    );
    return ok(await listStocktakes(catalogDb(), { status }));
  },
  { permission: "inventory.view" },
);

export const POST = withAuth(
  async (request, { actor }) => {
    const body = await readJson(request, startBody);
    if (!body.ok) return body.response;
    const result = await startStocktake(catalogDb(), actor, body.data);
    return respond(result, result.ok && !result.data.replayed ? 201 : 200);
  },
  { permission: "stocktake.count" },
);
