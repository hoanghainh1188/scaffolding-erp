import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { formOptions } from "@/lib/contracts/queries";
import { contractActor } from "@/lib/contracts/respond";

/** Customers, sites, items and kits D5a picks from. */
export const GET = withAuth(
  async (_request, { user, actor }) =>
    ok(await formOptions(catalogDb(), contractActor(user, actor))),
  { permission: "sales.view" },
);
