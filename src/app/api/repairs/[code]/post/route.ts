import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, respond } from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";
import { postRepairOrder } from "@/lib/repairs/orders";
import { repairKindOf } from "@/lib/repairs/queries";
import { REPAIR_CODE, postBody } from "@/lib/repairs/respond";
import { postWorkOrder } from "@/lib/repairs/work-post";

type Params = { code: string };

/** "Ghi sổ kho": 422 with the question when a high cost is not confirmed. */
export const POST = withAuth<Params>(
  async (request, { actor, params }) => {
    if (!REPAIR_CODE.test(params.code)) return NOT_FOUND();
    const body = await readJson(request, postBody);
    if (!body.ok) return body.response;
    const db = catalogDb();
    const kind = await repairKindOf(db, params.code);
    if (kind === null) return NOT_FOUND();
    return respond(
      kind === "WORK_ORDER"
        ? await postWorkOrder(db, actor, params.code, body.data)
        : await postRepairOrder(db, actor, params.code, body.data),
    );
  },
  { permission: "repairs.manage" },
);
