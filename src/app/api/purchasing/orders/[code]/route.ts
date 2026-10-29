import { PURCHASE_MESSAGES } from "@/domain/purchase-order";
import { fail, ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { deleteOrder, updateOrder } from "@/lib/purchasing/orders";
import { getOrderByCode } from "@/lib/purchasing/queries";
import { ORDER_CODE, orderBody } from "@/lib/purchasing/respond";
import { readJson } from "@/lib/read-json";

type Params = { code: string };

const NOT_FOUND = () => fail(PURCHASE_MESSAGES.notFound, 404);

export const GET = withAuth<Params>(
  async (_request, { params }) => {
    if (!ORDER_CODE.test(params.code)) return NOT_FOUND();
    const found = await getOrderByCode(catalogDb(), params.code);
    return found ? ok(found) : NOT_FOUND();
  },
  { permission: "purchasing.view" },
);

/** The whole order from D3, with the updatedAt the form was opened with. */
export const PATCH = withAuth<Params>(
  async (request, { actor, params }) => {
    if (!ORDER_CODE.test(params.code)) return NOT_FOUND();
    const body = await readJson(request, orderBody);
    if (!body.ok) return body.response;
    return respond(
      await updateOrder(catalogDb(), actor, params.code, body.data),
    );
  },
  { permission: "purchasing.manage" },
);

/** Drafts only; a placed order is cancelled instead. */
export const DELETE = withAuth<Params>(
  async (_request, { actor, params }) => {
    if (!ORDER_CODE.test(params.code)) return NOT_FOUND();
    return respond(await deleteOrder(catalogDb(), actor, params.code));
  },
  { permission: "purchasing.manage" },
);
