import { withAuth } from "@/lib/auth/guard";
import { deleteLocation, updateLocation } from "@/lib/catalog/places";
import {
  NOT_FOUND,
  catalogDb,
  isUuid,
  locationBody,
  respond,
} from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

/** Edits, archives (status) or restores; code and unit never change. */
export const PATCH = withAuth<Params>(
  async (request, { user, params }) => {
    if (!isUuid(params.id)) return NOT_FOUND();
    const body = await readJson(request, locationBody);
    if (!body.ok) return body.response;
    return respond(
      await updateLocation(catalogDb(), user, params.id, body.data),
    );
  },
  { permission: "locations.manage" },
);

/** Only rows nothing refers to; others answer 409 (archive instead). */
export const DELETE = withAuth<Params>(
  async (_request, { params }) => {
    if (!isUuid(params.id)) return NOT_FOUND();
    return respond(await deleteLocation(catalogDb(), params.id));
  },
  { permission: "locations.manage" },
);
