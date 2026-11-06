// "Tra nhanh một công trình" of D1 (dashboard-basic design D9): sites by
// code, name or customer, filtered on the server; money only with
// receivables.view (0.2 #91), contracts only within canContract.
import { fail, ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import {
  LOOKUP_MAX_LENGTH,
  LOOKUP_MESSAGES,
  siteLookup,
} from "@/lib/dashboard/lookup";
import { businessToday } from "@/lib/receivables/respond";

export const GET = withAuth(
  async (request, { user }) => {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    if (q.length > LOOKUP_MAX_LENGTH) return fail(LOOKUP_MESSAGES.tooLong, 400);
    const sites = await siteLookup(catalogDb(), user, q, businessToday());
    return ok({ sites });
  },
  { permission: "dashboard.view" },
);
