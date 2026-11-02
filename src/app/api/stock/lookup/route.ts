import { fail, ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { resolveItemCode } from "@/lib/catalog/items";
import { catalogDb } from "@/lib/catalog/respond";
import { stockLookup } from "@/lib/receiving/queries";
import { normalizeItemCode } from "@/domain/item-code";

const notFound = (code: string) => fail(`Không tìm thấy mã ${code}`, 404);

/**
 * M2: one item's stock by place and condition, no cost (design D13). Takes
 * the main code, a near spelling of it or an old code (catalog-extensions D1).
 */
export const GET = withAuth(
  async (request) => {
    const code = normalizeItemCode(
      new URL(request.url).searchParams.get("code") ?? "",
    );
    const db = catalogDb();
    const main = await resolveItemCode(db, code);
    if (!main) return notFound(code);
    const found = await stockLookup(db, main);
    return found ? ok(found) : notFound(code);
  },
  { permission: "stock.lookup" },
);
