import { withAuth } from "@/lib/auth/guard";
import { deleteCustomer, updateCustomer } from "@/lib/catalog/partners";
import {
  NOT_FOUND,
  catalogDb,
  isUuid,
  customerBody,
  respond,
} from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

/** Edits, archives (status) or restores; code and unit never change. */
export const PATCH = withAuth<Params>(
  async (request, { user, params }) => {
    if (!isUuid(params.id)) return NOT_FOUND();
    const body = await readJson(request, customerBody);
    if (!body.ok) return body.response;
    return respond(
      await updateCustomer(catalogDb(), user, params.id, body.data),
    );
  },
  { permission: "partners.manage" },
);

/** Only rows nothing refers to; others answer 409 (archive instead). */
export const DELETE = withAuth<Params>(
  async (_request, { params }) => {
    if (!isUuid(params.id)) return NOT_FOUND();
    return respond(await deleteCustomer(catalogDb(), params.id));
  },
  { permission: "partners.manage" },
);
