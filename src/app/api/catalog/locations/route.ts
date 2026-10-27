import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { createLocation, listLocations } from "@/lib/catalog/places";
import {
  catalogDb,
  locationBody,
  respond,
  statusParam,
} from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";

// Everyone reads the catalog; only "locations.manage" writes (master-data D9).
export const GET = withAuth(
  async (request) => {
    const url = new URL(request.url);
    return ok(await listLocations(catalogDb(), { status: statusParam(url) }));
  },
  { permission: "catalog.read" },
);

export const POST = withAuth(
  async (request, { user }) => {
    const body = await readJson(request, locationBody);
    if (!body.ok) return body.response;
    return respond(await createLocation(catalogDb(), user, body.data), 201);
  },
  { permission: "locations.manage" },
);
