// "Xuất Excel" of D15 (management-reports design D10): the period of the
// page, for those who read reports. A wrong period is refused (400).
import { readPeriod, REPORT_PERIOD_MESSAGES } from "@/domain/report-period";
import { fail } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { XLSX_CONTENT_TYPE } from "@/lib/export/xlsx";
import { businessToday } from "@/lib/receivables/respond";
import { exportReport } from "@/lib/reports/export";

export const GET = withAuth(
  async (request) => {
    const url = new URL(request.url);
    const today = businessToday();
    const period = readPeriod(
      url.searchParams.get("period") ?? undefined,
      url.searchParams.get("value") ?? undefined,
      today,
    );
    if (!period) return fail(REPORT_PERIOD_MESSAGES.invalid, 400);
    const result = await exportReport(catalogDb(), period, today);
    return new Response(Buffer.from(result.file), {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": `attachment; filename="${result.filename}"`,
        "cache-control": "no-store",
      },
    });
  },
  { permission: "reports.view" },
);
