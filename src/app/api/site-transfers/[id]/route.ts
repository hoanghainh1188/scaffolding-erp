import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { readJson } from "@/lib/read-json";
import { transferBody } from "@/lib/site-transfers/respond";
import { updateSiteTransfer } from "@/lib/site-transfers/service";

type Params = { id: string };

/** "Lưu" on a draft transfer (409 when stale). */
export const PUT = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, transferBody);
    if (!body.ok) return body.response;
    return respond(
      await updateSiteTransfer(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        body.data,
      ),
    );
  },
  { permission: "sales.view" },
);
