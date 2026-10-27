import { toBusinessDate } from "@/domain/business-date";
import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { createOrder } from "@/lib/purchasing/orders";
import { listOrders } from "@/lib/purchasing/queries";
import { createBody, orderFilterFrom } from "@/lib/purchasing/respond";
import { readJson } from "@/lib/read-json";

// Office roles read; sales and the director write (design D10, D12).
export const GET = withAuth(
  async (request) => {
    const filter = orderFilterFrom(new URL(request.url).searchParams);
    return ok(
      await listOrders(catalogDb(), filter, toBusinessDate(new Date())),
    );
  },
  { permission: "purchasing.view" },
);

/** "Lưu nháp" ({ place: false }) or "Lưu đơn" ({ place: true }). */
export const POST = withAuth(
  async (request, { user }) => {
    const body = await readJson(request, createBody);
    if (!body.ok) return body.response;
    const { place, ...order } = body.data;
    return respond(
      await createOrder(catalogDb(), user, order, { place: place ?? false }),
      201,
    );
  },
  { permission: "purchasing.manage" },
);
