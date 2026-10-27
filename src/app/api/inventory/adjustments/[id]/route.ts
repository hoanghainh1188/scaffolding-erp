import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, isUuid, respond } from "@/lib/catalog/respond";
import {
  deleteAdjustment,
  getAdjustment,
  updateAdjustment,
} from "@/lib/inventory/adjustments";
import { adjustmentBody } from "@/lib/inventory/respond";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

export const GET = withAuth<Params>(
  async (_request, { params }) => {
    if (!isUuid(params.id)) return NOT_FOUND();
    const found = await getAdjustment(catalogDb(), params.id);
    return found ? ok(found) : NOT_FOUND();
  },
  { permission: "inventory.view" },
);

/** Drafts only: replaces the reason and the lines. */
export const PATCH = withAuth<Params>(
  async (request, { params }) => {
    if (!isUuid(params.id)) return NOT_FOUND();
    const body = await readJson(request, adjustmentBody);
    if (!body.ok) return body.response;
    return respond(await updateAdjustment(catalogDb(), params.id, body.data));
  },
  { permission: "inventory.adjust" },
);

export const DELETE = withAuth<Params>(
  async (_request, { params }) => {
    if (!isUuid(params.id)) return NOT_FOUND();
    return respond(await deleteAdjustment(catalogDb(), params.id));
  },
  { permission: "inventory.adjust" },
);
