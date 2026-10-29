import { PURCHASE_MESSAGES } from "@/domain/purchase-order";
import { fail } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { placeOrder } from "@/lib/purchasing/orders";
import { ORDER_CODE } from "@/lib/purchasing/respond";

type Params = { code: string };

/** Nháp → đang xử lý (design D2). */
export const POST = withAuth<Params>(
  async (_request, { actor, params }) => {
    if (!ORDER_CODE.test(params.code)) {
      return fail(PURCHASE_MESSAGES.notFound, 404);
    }
    return respond(await placeOrder(catalogDb(), actor, params.code));
  },
  { permission: "purchasing.manage" },
);
