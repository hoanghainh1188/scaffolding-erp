import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { returnDetail } from "@/lib/returns/queries";

type Params = { code: string };

/** Desktop detail of a return note, with the value lost (design D12). */
export const GET = withAuth<Params>(
  async (_request, { user, actor, params }) =>
    respond(
      await returnDetail(catalogDb(), contractActor(user, actor), params.code, {
        withValues: true,
      }),
    ),
  { permission: "sales.view" },
);
