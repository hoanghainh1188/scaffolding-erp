import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, respond } from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";
import { REPAIR_CODE, floorBody } from "@/lib/repairs/respond";
import { countWorkOrder } from "@/lib/repairs/work-floor";

type Params = { code: string };

/** "Đếm xong": the storekeeper's numbers (0.2 số 128). Answers the state only, no price. */
export const POST = withAuth<Params>(
  async (request, { actor, params }) => {
    if (!REPAIR_CODE.test(params.code)) return NOT_FOUND();
    const body = await readJson(request, floorBody);
    if (!body.ok) return body.response;
    return respond(
      await countWorkOrder(catalogDb(), actor, params.code, body.data),
    );
  },
  { permission: "repairs.count" },
);
