// "Xuất Excel" of D14c: the filter and search on screen, every page.
import { fail } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { XLSX_CONTENT_TYPE } from "@/lib/export/xlsx";
import { ExportTooLarge, exportPayables } from "@/lib/payables/export";
import { businessToday, payableQuery } from "@/lib/payables/respond";

export const GET = withAuth(
  async (request) => {
    const query = payableQuery(new URL(request.url));
    try {
      const result = await exportPayables(catalogDb(), businessToday(), {
        filter: query.filter,
        q: query.q,
      });
      return new Response(Buffer.from(result.file), {
        headers: {
          "content-type": XLSX_CONTENT_TYPE,
          "content-disposition": `attachment; filename="${result.filename}"`,
          "cache-control": "no-store",
        },
      });
    } catch (error: unknown) {
      if (error instanceof ExportTooLarge) return fail(error.message, 422);
      throw error;
    }
  },
  { permission: "payables.view" },
);
