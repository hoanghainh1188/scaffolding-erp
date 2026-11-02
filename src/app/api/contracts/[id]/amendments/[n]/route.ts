import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { updateAmendment } from "@/lib/contracts/amendments";
import { getAmendmentDetail } from "@/lib/contracts/queries";
import { amendmentBody, contractActor } from "@/lib/contracts/respond";
import { readJson } from "@/lib/read-json";

type Params = { id: string; n: string };

export const GET = withAuth<Params>(
  async (_request, { user, actor, params }) =>
    respond(
      await getAmendmentDetail(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        Number(params.n),
      ),
    ),
  { permission: "sales.view" },
);

/** The whole amendment from D5b, with the updatedAt it was opened with. */
export const PUT = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, amendmentBody);
    if (!body.ok) return body.response;
    return respond(
      await updateAmendment(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        Number(params.n),
        body.data,
      ),
    );
  },
  { permission: "sales.view" },
);
