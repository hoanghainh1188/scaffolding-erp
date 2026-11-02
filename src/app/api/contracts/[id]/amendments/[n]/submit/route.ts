import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { submitAmendment } from "@/lib/contracts/amendments";
import { contractActor } from "@/lib/contracts/respond";

type Params = { id: string; n: string };

export const POST = withAuth<Params>(
  async (_request, { user, actor, params }) =>
    respond(
      await submitAmendment(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        Number(params.n),
      ),
    ),
  { permission: "sales.view" },
);
