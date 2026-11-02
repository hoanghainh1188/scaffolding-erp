import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { returnAmendment } from "@/lib/contracts/amendments";
import { contractActor, reasonBody } from "@/lib/contracts/respond";
import { readJson } from "@/lib/read-json";

type Params = { id: string; n: string };

export const POST = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, reasonBody);
    if (!body.ok) return body.response;
    return respond(
      await returnAmendment(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        Number(params.n),
        body.data.reason,
      ),
    );
  },
  { permission: "sales.view" },
);
