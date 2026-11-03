import { toBusinessDate } from "@/domain/business-date";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { contractDeliveries } from "@/lib/deliveries/queries";

type Params = { id: string };

/** D6 of one contract: on site, what is left, the batches (design D12). */
export const GET = withAuth<Params>(
  async (_request, { user, actor, params }) =>
    respond(
      await contractDeliveries(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        toBusinessDate(new Date()),
      ),
    ),
  { permission: "sales.view" },
);
