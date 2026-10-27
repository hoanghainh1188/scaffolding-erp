import { fail, ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { stockLookup } from "@/lib/receiving/queries";
import { isValidCatalogCode, normalizeCatalogCode } from "@/domain/item-code";

const notFound = (code: string) => fail(`Không tìm thấy mã ${code}`, 404);

/** M2: one item's stock by place and condition, no cost (design D13). */
export const GET = withAuth(
  async (request) => {
    const code = normalizeCatalogCode(
      new URL(request.url).searchParams.get("code") ?? "",
    );
    if (!isValidCatalogCode(code)) return notFound(code);
    const found = await stockLookup(catalogDb(), code);
    return found ? ok(found) : notFound(code);
  },
  { permission: "stock.lookup" },
);
