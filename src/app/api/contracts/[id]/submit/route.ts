import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { submitContract } from "@/lib/contracts/approval";
import { contractActor } from "@/lib/contracts/respond";

type Params = { id: string };

/** "Gửi Giám đốc duyệt". */
export const POST = withAuth<Params>(
  async (_request, { user, actor, params }) =>
    respond(
      await submitContract(catalogDb(), contractActor(user, actor), params.id),
    ),
  { permission: "sales.view" },
);
