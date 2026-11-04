import { withAuth } from "@/lib/auth/guard";
import { buyBackBody } from "@/lib/buy-backs/respond";
import { createBuyBack } from "@/lib/buy-backs/service";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { readJson } from "@/lib/read-json";

/** D6c "Gửi duyệt": sales of rentals make a pending note (canContract). */
export const POST = withAuth(
  async (request, { user, actor }) => {
    const body = await readJson(request, buyBackBody);
    if (!body.ok) return body.response;
    return respond(
      await createBuyBack(catalogDb(), contractActor(user, actor), body.data),
      201,
    );
  },
  { permission: "sales.view" },
);
