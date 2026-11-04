import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { readJson } from "@/lib/read-json";
import { postSiteTransferFromPhone } from "@/lib/site-transfers/post";
import { phonePostBody } from "@/lib/site-transfers/respond";

type Params = { code: string };

/** M9 "Xác nhận đã chuyển tới …": 201 when posted now, 200 when resent. */
export const POST = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, phonePostBody);
    if (!body.ok) return body.response;
    const result = await postSiteTransferFromPhone(
      catalogDb(),
      contractActor(user, actor),
      params.code,
      body.data,
    );
    return respond(result, result.ok && !result.data.replayed ? 201 : 200);
  },
  { permission: "deliveries.pick" },
);
