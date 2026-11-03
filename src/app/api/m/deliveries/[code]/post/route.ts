import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { postDelivery } from "@/lib/deliveries/post";
import { postBody } from "@/lib/deliveries/respond";
import { readJson } from "@/lib/read-json";

type Params = { code: string };

/** "Xác nhận xe rời bãi": 201 when posted now, 200 for a resent draft. */
export const POST = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, postBody);
    if (!body.ok) return body.response;
    const result = await postDelivery(
      catalogDb(),
      contractActor(user, actor),
      params.code,
      body.data,
    );
    return respond(result, result.ok && !result.data.replayed ? 201 : 200);
  },
  { permission: "deliveries.pick" },
);
