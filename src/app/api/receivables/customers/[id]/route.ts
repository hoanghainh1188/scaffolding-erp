// D14, one customer: debts, deposits and guarantees, receipts.
import { fail, ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { COMMON_MESSAGES } from "@/lib/catalog/common";
import { catalogDb } from "@/lib/catalog/respond";
import { customerDetail } from "@/lib/receivables/queries";
import { businessToday } from "@/lib/receivables/respond";

type Params = { id: string };

export const GET = withAuth<Params>(
  async (_request, { params }) => {
    const detail = await customerDetail(
      catalogDb(),
      params.id,
      businessToday(),
    );
    return detail ? ok(detail) : fail(COMMON_MESSAGES.notFound, 404);
  },
  { permission: "receivables.view" },
);
