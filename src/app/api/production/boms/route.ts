import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { listBoms } from "@/lib/production/queries";

export const GET = withAuth(async () => ok(await listBoms(catalogDb())), {
  permission: "production.view",
});
