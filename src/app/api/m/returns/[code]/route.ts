import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { returnDetail } from "@/lib/returns/queries";

type Params = { code: string };

// M7: a posted return note to read on the phone, without money.
export const GET = withAuth<Params>(
  async (_request, { user, actor, params }) =>
    respond(
      await returnDetail(catalogDb(), contractActor(user, actor), params.code, {
        withValues: false,
      }),
    ),
  { permission: "returns.receive" },
);
