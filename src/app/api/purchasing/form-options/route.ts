import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { orderFormOptions } from "@/lib/purchasing/queries";

/** Active suppliers and items for the D3 pickers. */
export const GET = withAuth(
  async () => ok(await orderFormOptions(catalogDb())),
  { permission: "purchasing.view" },
);
