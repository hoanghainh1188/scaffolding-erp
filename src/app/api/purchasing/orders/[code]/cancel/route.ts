import { PURCHASE_MESSAGES } from "@/domain/purchase-order";
import { fail } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { cancelOrder } from "@/lib/purchasing/orders";
import { ORDER_CODE, reasonBody } from "@/lib/purchasing/respond";
import { readJson } from "@/lib/read-json";

type Params = { code: string };

/** Before any goods receipt; the reason is required. */
export const POST = withAuth<Params>(
  async (request, { user, params }) => {
    if (!ORDER_CODE.test(params.code)) {
      return fail(PURCHASE_MESSAGES.notFound, 404);
    }
    const body = await readJson(request, reasonBody);
    if (!body.ok) return body.response;
    return respond(
      await cancelOrder(catalogDb(), user, params.code, body.data.reason),
    );
  },
  { permission: "purchasing.manage" },
);
