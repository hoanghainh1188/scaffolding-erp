// "Chốt kỳ và ghi công nợ" (accountant, director: billing.manage).
import { withAuth } from "@/lib/auth/guard";
import { closeBillingPeriod } from "@/lib/billing/close";
import { closeBody } from "@/lib/billing/respond";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";

type Params = { month: string; id: string };

export const POST = withAuth<Params>(
  async (request, { actor, params }) => {
    const body = await readJson(request, closeBody);
    if (!body.ok) return body.response;
    return respond(
      await closeBillingPeriod(
        catalogDb(),
        actor,
        params.id,
        params.month,
        body.data,
      ),
      201,
    );
  },
  { permission: "billing.manage" },
);
