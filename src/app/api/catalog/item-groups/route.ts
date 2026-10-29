import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { createGroup, listGroups } from "@/lib/catalog/item-groups";
import { catalogDb, groupBody, respond } from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";

// Everyone reads the catalog; only "items.manage" writes (master-data D9).
export const GET = withAuth(
  async () => {
    return ok(await listGroups(catalogDb()));
  },
  { permission: "catalog.read" },
);

export const POST = withAuth(
  async (request, { actor }) => {
    const body = await readJson(request, groupBody);
    if (!body.ok) return body.response;
    return respond(await createGroup(catalogDb(), actor, body.data), 201);
  },
  { permission: "items.manage" },
);
