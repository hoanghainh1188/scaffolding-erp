import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { termsFor } from "@/lib/contracts/queries";
import { contractActor } from "@/lib/contracts/respond";

type Params = { id: string };

/** The revision in force on ?date=YYYY-MM-DD (contract-amendments spec). */
export const GET = withAuth<Params>(
  async (request, { user, actor, params }) =>
    respond(
      await termsFor(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        new URL(request.url).searchParams.get("date"),
      ),
    ),
  { permission: "sales.view" },
);
