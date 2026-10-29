import { withAuth } from "@/lib/auth/guard";
import { deleteItem, updateItem } from "@/lib/catalog/items";
import {
  NOT_FOUND,
  catalogDb,
  isUuid,
  itemBody,
  respond,
} from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

/** Edits, archives (status) or restores; code and unit never change. */
export const PATCH = withAuth<Params>(
  async (request, { actor, params }) => {
    if (!isUuid(params.id)) return NOT_FOUND();
    const body = await readJson(request, itemBody);
    if (!body.ok) return body.response;
    return respond(await updateItem(catalogDb(), actor, params.id, body.data));
  },
  { permission: "items.manage" },
);

/** Only rows nothing refers to; others answer 409 (archive instead). */
export const DELETE = withAuth<Params>(
  async (_request, { actor, params }) => {
    if (!isUuid(params.id)) return NOT_FOUND();
    return respond(await deleteItem(catalogDb(), actor, params.id));
  },
  { permission: "items.manage" },
);
