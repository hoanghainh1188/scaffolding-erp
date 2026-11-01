import { getDatabase } from "@/db/client";
import { companyProfileInputSchema } from "@/domain/company";
import { fail, ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { getCompanyProfile, updateCompanyProfile } from "@/lib/company/service";
import { readJson } from "@/lib/read-json";

export const GET = withAuth(
  async () => {
    const profile = await getCompanyProfile(getDatabase());
    return ok(profile);
  },
  { permission: "company.read" },
);

export const PUT = withAuth(
  async (request, { actor }) => {
    const body = await readJson(request, companyProfileInputSchema);
    if (!body.ok) return body.response;
    const result = await updateCompanyProfile(getDatabase(), actor, body.data);
    if (!result.ok) {
      return fail(result.error, result.status);
    }
    return ok(result.data);
  },
  { permission: "company.manage" },
);
