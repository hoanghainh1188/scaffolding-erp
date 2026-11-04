// D7 list: rental contracts of a month with their amount and state.
import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { periodList } from "@/lib/billing/queries";
import {
  businessToday,
  monthParam,
  rentalReadRefusal,
} from "@/lib/billing/respond";
import { catalogDb } from "@/lib/catalog/respond";

type Params = { month: string };

export const GET = withAuth<Params>(
  async (_request, { user, params }) => {
    const refusal = rentalReadRefusal(user);
    if (refusal) return refusal;
    const month = monthParam(params.month);
    if (!month.ok) return month.response;
    return ok(await periodList(catalogDb(), month.month, businessToday()));
  },
  { permission: "billing.view" },
);
