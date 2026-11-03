import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { rejectCompensation } from "@/lib/compensations/service";
import { contractActor } from "@/lib/contracts/respond";
import { readJson } from "@/lib/read-json";
import { compensationRejectBody } from "@/lib/returns/respond";

type Params = { id: string };

/** "Từ chối" with a reason (director only); final. */
export const POST = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, compensationRejectBody);
    if (!body.ok) return body.response;
    return respond(
      await rejectCompensation(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        body.data,
      ),
    );
  },
  { permission: "compensations.approve" },
);
