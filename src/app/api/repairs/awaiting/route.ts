import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, isUuid } from "@/lib/catalog/respond";
import { awaitingRepair } from "@/lib/repairs/queries";

// D12 right column and the cost preview (design D10, D11).
export const GET = withAuth(
  async (request) => {
    const params = new URL(request.url).searchParams;
    const locationId = params.get("locationId") ?? undefined;
    if (!isUuid(locationId)) return NOT_FOUND();
    const extra = params.getAll("itemId").filter((id) => isUuid(id));
    return ok(await awaitingRepair(catalogDb(), locationId, extra));
  },
  { permission: "repairs.view" },
);
