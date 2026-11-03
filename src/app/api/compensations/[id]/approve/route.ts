import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { approveCompensation } from "@/lib/compensations/service";
import { contractActor } from "@/lib/contracts/respond";
import { readJson } from "@/lib/read-json";
import { compensationApproveBody } from "@/lib/returns/respond";

type Params = { id: string };

/** "Duyệt <tiền>" (director only). */
export const POST = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, compensationApproveBody);
    if (!body.ok) return body.response;
    return respond(
      await approveCompensation(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        body.data,
      ),
    );
  },
  { permission: "compensations.approve" },
);
