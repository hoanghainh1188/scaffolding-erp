// D7 statement of one rental contract for a month.
import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { contractStatement } from "@/lib/billing/queries";
import {
  businessToday,
  monthParam,
  rentalReadRefusal,
} from "@/lib/billing/respond";
import { catalogDb, isUuid, NOT_FOUND } from "@/lib/catalog/respond";

type Params = { month: string; id: string };

export const GET = withAuth<Params>(
  async (_request, { user, params }) => {
    const refusal = rentalReadRefusal(user);
    if (refusal) return refusal;
    const month = monthParam(params.month);
    if (!month.ok) return month.response;
    if (!isUuid(params.id)) return NOT_FOUND();
    const view = await contractStatement(
      catalogDb(),
      params.id,
      month.month,
      businessToday(),
    );
    return view ? ok(view) : NOT_FOUND();
  },
  { permission: "billing.view" },
);
