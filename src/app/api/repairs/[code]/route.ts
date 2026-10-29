import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, respond } from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";
import { deleteRepairDraft, updateRepairDraft } from "@/lib/repairs/orders";
import { getRepairOrder } from "@/lib/repairs/queries";
import { REPAIR_CODE, repairBody } from "@/lib/repairs/respond";

type Params = { code: string };

export const GET = withAuth<Params>(
  async (_request, { params }) => {
    if (!REPAIR_CODE.test(params.code)) return NOT_FOUND();
    const found = await getRepairOrder(catalogDb(), params.code);
    return found ? ok(found) : NOT_FOUND();
  },
  { permission: "repairs.view" },
);

/** Drafts only, guarded by the updatedAt the form was opened with. */
export const PUT = withAuth<Params>(
  async (request, { actor, params }) => {
    if (!REPAIR_CODE.test(params.code)) return NOT_FOUND();
    const body = await readJson(request, repairBody);
    if (!body.ok) return body.response;
    return respond(
      await updateRepairDraft(catalogDb(), actor, params.code, body.data),
    );
  },
  { permission: "repairs.manage" },
);

export const DELETE = withAuth<Params>(
  async (_request, { actor, params }) => {
    if (!REPAIR_CODE.test(params.code)) return NOT_FOUND();
    return respond(await deleteRepairDraft(catalogDb(), actor, params.code));
  },
  { permission: "repairs.manage" },
);
