// D14 "Theo nhà thầu": tiles, filter counts and one page (receivables.view).
import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { customerBalances } from "@/lib/receivables/balances";
import { guaranteeAlerts } from "@/lib/receivables/queries";
import { balanceQuery, businessToday } from "@/lib/receivables/respond";

export const GET = withAuth(
  async (request) => {
    const today = businessToday();
    const db = catalogDb();
    const page = await customerBalances(
      db,
      today,
      balanceQuery(new URL(request.url)),
    );
    return ok({
      today,
      totals: page.totals,
      counts: page.counts,
      rows: page.rows,
      page: page.page,
      pageCount: page.pageCount,
      guarantees: await guaranteeAlerts(db, today),
    });
  },
  { permission: "receivables.view" },
);
