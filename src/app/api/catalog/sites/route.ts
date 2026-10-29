import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { createSite, listSites } from "@/lib/catalog/places";
import {
  catalogDb,
  respond,
  siteBody,
  statusParam,
  textParam,
} from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";

// Everyone reads the catalog; only "partners.manage" writes (master-data D9).
export const GET = withAuth(
  async (request) => {
    const url = new URL(request.url);
    return ok(
      await listSites(catalogDb(), {
        q: textParam(url, "q"),
        status: statusParam(url),
        customerId: textParam(url, "customer"),
      }),
    );
  },
  { permission: "catalog.read" },
);

export const POST = withAuth(
  async (request, { actor }) => {
    const body = await readJson(request, siteBody);
    if (!body.ok) return body.response;
    return respond(await createSite(catalogDb(), actor, body.data), 201);
  },
  { permission: "partners.manage" },
);
