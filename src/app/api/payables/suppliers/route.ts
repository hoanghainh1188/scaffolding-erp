// D14c "Theo người bán": tiles, filter counts and one page (payables.view).
import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { supplierBalances } from "@/lib/payables/balances";
import { businessToday, payableQuery } from "@/lib/payables/respond";

export const GET = withAuth(
  async (request) => {
    const today = businessToday();
    const page = await supplierBalances(
      catalogDb(),
      today,
      payableQuery(new URL(request.url)),
    );
    return ok({
      today,
      totals: page.totals,
      counts: page.counts,
      rows: page.rows,
      page: page.page,
      pageCount: page.pageCount,
    });
  },
  { permission: "payables.view" },
);
