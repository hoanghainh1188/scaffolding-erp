import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { compensationDetail } from "@/lib/compensations/queries";
import { compensationEditBody } from "@/lib/returns/respond";
import { updateCompensation } from "@/lib/compensations/service";
import { contractActor } from "@/lib/contracts/respond";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

/** D8 by id or code. */
export const GET = withAuth<Params>(
  async (_request, { user, actor, params }) =>
    respond(
      await compensationDetail(
        catalogDb(),
        contractActor(user, actor),
        params.id,
      ),
    ),
  { permission: "sales.view" },
);

/** "Lưu": prices of lines without one, discount and its reason. */
export const PUT = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, compensationEditBody);
    if (!body.ok) return body.response;
    return respond(
      await updateCompensation(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        body.data,
      ),
    );
  },
  { permission: "compensations.approve" },
);
