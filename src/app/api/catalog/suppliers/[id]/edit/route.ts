import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { getSupplierForEdit } from "@/lib/catalog/partners";
import { NOT_FOUND, catalogDb, isUuid } from "@/lib/catalog/respond";

/**
 * The edit form's data, with the full CCCD. Only for people who may edit
 * partners; every other read gets the masked number (master-data D5).
 */
export const GET = withAuth<{ id: string }>(
  async (_request, { params }) => {
    if (!isUuid(params.id)) return NOT_FOUND();
    const row = await getSupplierForEdit(catalogDb(), params.id);
    if (!row) return NOT_FOUND();
    const response = ok(row);
    response.headers.set("cache-control", "no-store");
    return response;
  },
  { permission: "partners.manage" },
);
