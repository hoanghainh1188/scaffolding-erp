import { withAuth } from "@/lib/auth/guard";
import { buyBackBody } from "@/lib/buy-backs/respond";
import { updateBuyBack } from "@/lib/buy-backs/service";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

/** "Lưu" on a pending buy-back (409 when stale). */
export const PUT = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, buyBackBody);
    if (!body.ok) return body.response;
    return respond(
      await updateBuyBack(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        body.data,
      ),
    );
  },
  { permission: "sales.view" },
);
