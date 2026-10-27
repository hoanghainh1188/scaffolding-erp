import { PURCHASE_MESSAGES } from "@/domain/purchase-order";
import { fail, ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { orderForReceiving } from "@/lib/receiving/queries";
import { ORDER_CODE } from "@/lib/receiving/respond";

type Params = { code: string };

const NOT_FOUND = () => fail(PURCHASE_MESSAGES.notFound, 404);

/** The open lines of an order for M3, without prices (design D11, D13). */
export const GET = withAuth<Params>(
  async (_request, { params }) => {
    if (!ORDER_CODE.test(params.code)) return NOT_FOUND();
    const found = await orderForReceiving(catalogDb(), params.code);
    return found ? ok(found) : NOT_FOUND();
  },
  { permission: "receiving.manage" },
);
