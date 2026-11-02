import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { createAmendment } from "@/lib/contracts/amendments";
import { contractActor } from "@/lib/contracts/respond";

type Params = { id: string };

/** "Lập phụ lục": a draft copy of the terms in force. */
export const POST = withAuth<Params>(
  async (_request, { user, actor, params }) =>
    respond(
      await createAmendment(catalogDb(), contractActor(user, actor), params.id),
      201,
    ),
  { permission: "sales.view" },
);
