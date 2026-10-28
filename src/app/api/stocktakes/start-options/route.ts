import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { startOptions } from "@/lib/stocktakes/queries";

/** M6a: yards, workshops and the line count of each group. */
export const GET = withAuth(async () => ok(await startOptions(catalogDb())), {
  permission: "stocktake.count",
});
