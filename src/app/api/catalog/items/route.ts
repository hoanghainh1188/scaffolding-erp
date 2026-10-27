import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { createItem, listItems } from "@/lib/catalog/items";
import {
  catalogDb,
  itemBody,
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
      await listItems(catalogDb(), {
        q: textParam(url, "q"),
        groupId: textParam(url, "group"),
        status: statusParam(url),
      }),
    );
  },
  { permission: "catalog.read" },
);

export const POST = withAuth(
  async (request, { user }) => {
    const body = await readJson(request, itemBody);
    if (!body.ok) return body.response;
    return respond(await createItem(catalogDb(), user, body.data), 201);
  },
  { permission: "items.manage" },
);
