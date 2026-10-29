import { parseActivityFilter } from "@/domain/activity-filter";
import { toBusinessDate } from "@/domain/business-date";
import { exportActivity } from "@/lib/activity/queries";
import { fail } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { XLSX_CONTENT_TYPE } from "@/lib/export/xlsx";

/** "Xuất Excel" of D18: the whole filter, at most 10.000 rows (D10). */
export const GET = withAuth(
  async (request) => {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = parseActivityFilter(params, toBusinessDate(new Date()));
    if (!parsed.ok) return fail(parsed.error, 400);
    const result = await exportActivity(catalogDb(), parsed.filter);
    if (!result.ok) return fail(result.error, result.status);
    return new Response(Buffer.from(result.file), {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": `attachment; filename="${result.filename}"`,
        "cache-control": "no-store",
      },
    });
  },
  { permission: "activity.view" },
);
