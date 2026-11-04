// Duyệt: posts the sale at the site and stops the rent (director only, buybacks.approve).
import { withAuth } from "@/lib/auth/guard";
import { decisionBody } from "@/lib/buy-backs/respond";
import { approveBuyBack } from "@/lib/buy-backs/service";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

export const POST = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, decisionBody);
    if (!body.ok) return body.response;
    return respond(
      await approveBuyBack(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        body.data,
      ),
    );
  },
  { permission: "buybacks.approve" },
);
