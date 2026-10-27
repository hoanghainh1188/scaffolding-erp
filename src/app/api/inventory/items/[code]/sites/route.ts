import { eq } from "drizzle-orm";

import { item } from "@/db/schema";
import { fail, ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { getItemSites } from "@/lib/inventory/stock";

type Params = { code: string };

/** D10 "Tại công trình": the sites holding an item. */
export const GET = withAuth<Params>(
  async (_request, { params }) => {
    const db = catalogDb();
    const [found] = await db
      .select({ id: item.id })
      .from(item)
      .where(eq(item.code, params.code.toUpperCase()));
    if (!found) return fail("Không tìm thấy mã hàng", 404);
    return ok(await getItemSites(db, found.id));
  },
  { permission: "inventory.view" },
);
