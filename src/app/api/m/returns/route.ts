import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { readJson } from "@/lib/read-json";
import { postReturn } from "@/lib/returns/post";
import { returnBody } from "@/lib/returns/respond";

/** "Lưu phiếu thu hồi": 201 when posted now, 200 for a resent draft. */
export const POST = withAuth(
  async (request, { user, actor }) => {
    const body = await readJson(request, returnBody);
    if (!body.ok) return body.response;
    const result = await postReturn(
      catalogDb(),
      contractActor(user, actor),
      body.data,
    );
    return respond(result, result.ok && !result.data.replayed ? 201 : 200);
  },
  { permission: "returns.receive" },
);
