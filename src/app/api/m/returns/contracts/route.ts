import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, textParam } from "@/lib/catalog/respond";
import { returnContracts } from "@/lib/returns/queries";

// M4 step 1: active rentals with goods on site. No prices.
export const GET = withAuth(
  async (request) =>
    ok(
      await returnContracts(catalogDb(), textParam(new URL(request.url), "q")),
    ),
  { permission: "returns.receive" },
);
