// "Xuất Excel" of D7: the whole month (design D9).
import { withAuth } from "@/lib/auth/guard";
import { exportPeriod } from "@/lib/billing/export";
import {
  businessToday,
  monthParam,
  rentalReadRefusal,
} from "@/lib/billing/respond";
import { catalogDb } from "@/lib/catalog/respond";
import { XLSX_CONTENT_TYPE } from "@/lib/export/xlsx";

type Params = { month: string };

export const GET = withAuth<Params>(
  async (_request, { user, params }) => {
    const refusal = rentalReadRefusal(user);
    if (refusal) return refusal;
    const month = monthParam(params.month);
    if (!month.ok) return month.response;
    const result = await exportPeriod(
      catalogDb(),
      month.month,
      businessToday(),
    );
    return new Response(Buffer.from(result.file), {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": `attachment; filename="${result.filename}"`,
        "cache-control": "no-store",
      },
    });
  },
  { permission: "billing.view" },
);
