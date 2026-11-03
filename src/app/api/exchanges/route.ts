import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { exchangeBody } from "@/lib/exchanges/respond";
import { createExchange } from "@/lib/exchanges/service";
import { readJson } from "@/lib/read-json";

/** D6d "Tạo đợt xuất + chờ thu hồi" (canContract, rentals). */
export const POST = withAuth(
  async (request, { user, actor }) => {
    const body = await readJson(request, exchangeBody);
    if (!body.ok) return body.response;
    return respond(
      await createExchange(catalogDb(), contractActor(user, actor), body.data),
      201,
    );
  },
  { permission: "sales.view" },
);
