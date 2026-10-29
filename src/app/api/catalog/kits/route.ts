import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { createKit, listKits } from "@/lib/catalog/kits";
import {
  catalogDb,
  kitBody,
  respond,
  statusParam,
  textParam,
} from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";

// Everyone reads the catalog; only "items.manage" writes (master-data D9).
export const GET = withAuth(
  async (request) => {
    const url = new URL(request.url);
    return ok(
      await listKits(catalogDb(), {
        q: textParam(url, "q"),
        status: statusParam(url),
        containsItemId: textParam(url, "item"),
      }),
    );
  },
  { permission: "catalog.read" },
);

export const POST = withAuth(
  async (request, { actor }) => {
    const body = await readJson(request, kitBody);
    if (!body.ok) return body.response;
    return respond(await createKit(catalogDb(), actor, body.data), 201);
  },
  { permission: "items.manage" },
);
