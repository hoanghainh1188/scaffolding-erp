import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, textParam } from "@/lib/catalog/respond";
import { getStockOverview } from "@/lib/inventory/stock";

/** D10: stock per item from the ledger (inventory-ledger D6). */
export const GET = withAuth(
  async (request) => {
    const url = new URL(request.url);
    return ok(
      await getStockOverview(catalogDb(), {
        q: textParam(url, "q"),
        groupId: textParam(url, "group"),
      }),
    );
  },
  { permission: "inventory.view" },
);
