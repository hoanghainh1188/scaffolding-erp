// "Xác nhận chuyển" on a saved draft: the office posts it now.
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { readJson } from "@/lib/read-json";
import { postSiteTransfer } from "@/lib/site-transfers/post";
import { versionBody } from "@/lib/site-transfers/respond";

type Params = { id: string };

export const POST = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, versionBody);
    if (!body.ok) return body.response;
    return respond(
      await postSiteTransfer(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        body.data,
      ),
      201,
    );
  },
  { permission: "sales.view" },
);
