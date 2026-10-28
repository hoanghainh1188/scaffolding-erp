import { fail } from "@/lib/api-response";
import { GUARD_MESSAGES, withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, respond } from "@/lib/catalog/respond";
import { can } from "@/domain/permissions";
import { readJson } from "@/lib/read-json";
import { STOCKTAKE_CODE, reasonBody } from "@/lib/stocktakes/respond";
import { cancelStocktake } from "@/lib/stocktakes/sessions";

type Params = { code: string };

/**
 * "Hủy phiên": counters while counting, the director also once sent. The
 * guard admits either permission; the service checks the state (D10).
 */
export const POST = withAuth<Params>(async (request, { user, params }) => {
  if (
    !can(user.role, "stocktake.count") &&
    !can(user.role, "inventory.approve")
  ) {
    return fail(GUARD_MESSAGES.forbidden, 403);
  }
  if (!STOCKTAKE_CODE.test(params.code)) return NOT_FOUND();
  const body = await readJson(request, reasonBody);
  if (!body.ok) return body.response;
  return respond(
    await cancelStocktake(catalogDb(), user, params.code, body.data),
  );
});
