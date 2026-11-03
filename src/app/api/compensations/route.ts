import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import {
  compensationList,
  parseCompensationStatus,
} from "@/lib/compensations/queries";
import { contractActor } from "@/lib/contracts/respond";

/** `/sales/compensations`: ?status=PENDING (default), APPROVED, REJECTED, ALL. */
export const GET = withAuth(
  async (request, { user, actor }) =>
    respond(
      await compensationList(
        catalogDb(),
        contractActor(user, actor),
        parseCompensationStatus(
          new URL(request.url).searchParams.get("status"),
        ),
      ),
    ),
  { permission: "sales.view" },
);
