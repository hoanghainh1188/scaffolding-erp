import { can } from "@/domain/permissions";
import { fail } from "@/lib/api-response";
import { GUARD_MESSAGES, withAuth } from "@/lib/auth/guard";
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
  async (request, { actor, params, user }) => {
    if (!isUuid(params.id)) return NOT_FOUND();
    const body = await readJson(request, itemBody);
    if (!body.ok) return body.response;
    const { repairLaborRate, ...input } = body.data;
    // The labour rate belongs to repairs.manage (0.2 số 123), not items.manage.
    if (repairLaborRate !== undefined && !can(user.role, "repairs.manage")) {
      return fail(GUARD_MESSAGES.forbidden, 403);
    }
    return respond(await updateItem(catalogDb(), actor, params.id, input));
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
