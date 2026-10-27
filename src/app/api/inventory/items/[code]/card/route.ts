import { fail, ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { getStockCard } from "@/lib/inventory/card";
import { cardFilterFrom } from "@/lib/inventory/respond";

type Params = { code: string };

/** D11 stock card: ?condition=&place=&site=&from=&to= */
export const GET = withAuth<Params>(
  async (request, { params }) => {
    const filter = cardFilterFrom(new URL(request.url).searchParams);
    const card = await getStockCard(
      catalogDb(),
      params.code.toUpperCase(),
      filter,
    );
    return card ? ok(card) : fail("Không tìm thấy mã hàng", 404);
  },
  { permission: "inventory.view" },
);
