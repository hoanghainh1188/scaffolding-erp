import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { cancelContract } from "@/lib/contracts/approval";
import { contractActor, reasonBody } from "@/lib/contracts/respond";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

/** A draft by its seller, an approved contract by the director. */
export const POST = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, reasonBody);
    if (!body.ok) return body.response;
    return respond(
      await cancelContract(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        body.data.reason,
      ),
    );
  },
  { permission: "sales.view" },
);
