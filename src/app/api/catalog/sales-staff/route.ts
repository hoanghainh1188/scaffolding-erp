import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { listSalesStaff } from "@/lib/catalog/partners";
import { catalogDb } from "@/lib/catalog/respond";

// Who can be put in charge of a customer (catalog-extensions D5): id, name
// and status only, never the username or another role.
export const GET = withAuth(
  async () => {
    return ok(await listSalesStaff(catalogDb()));
  },
  { permission: "catalog.read" },
);
