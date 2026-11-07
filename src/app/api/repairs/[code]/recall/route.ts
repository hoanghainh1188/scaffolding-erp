import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, respond } from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";
import { REPAIR_CODE, stepBody } from "@/lib/repairs/respond";
import { recallWorkOrder } from "@/lib/repairs/work-orders";

type Params = { code: string };

/** "Thu hồi lệnh": back to draft before the workshop takes it. */
export const POST = withAuth<Params>(
  async (request, { actor, params }) => {
    if (!REPAIR_CODE.test(params.code)) return NOT_FOUND();
    const body = await readJson(request, stepBody);
    if (!body.ok) return body.response;
    return respond(
      await recallWorkOrder(catalogDb(), actor, params.code, body.data),
    );
  },
  { permission: "repairs.manage" },
);
