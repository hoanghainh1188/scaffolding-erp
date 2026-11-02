import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { approveContract } from "@/lib/contracts/approval";
import { contractActor, reasonBody } from "@/lib/contracts/respond";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

/** Director only; overdue debt needs a reason (0.2 #15). */
export const POST = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, reasonBody);
    if (!body.ok) return body.response;
    return respond(
      await approveContract(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        body.data.reason,
      ),
    );
  },
  { permission: "sales.view" },
);
