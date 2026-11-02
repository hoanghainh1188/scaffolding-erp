import { toBusinessDate } from "@/domain/business-date";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { getContractDetail } from "@/lib/contracts/queries";
import { contractActor, contractBody } from "@/lib/contracts/respond";
import { updateContract } from "@/lib/contracts/service";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

export const GET = withAuth<Params>(
  async (_request, { user, actor, params }) =>
    respond(
      await getContractDetail(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        toBusinessDate(new Date()),
      ),
    ),
  { permission: "sales.view" },
);

/** The whole draft from D5a, with the updatedAt it was opened with. */
export const PUT = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, contractBody);
    if (!body.ok) return body.response;
    return respond(
      await updateContract(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        body.data,
      ),
    );
  },
  { permission: "sales.view" },
);
