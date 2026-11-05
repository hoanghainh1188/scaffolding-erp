// D14b: conditions and set-off (receivables.view); "Thanh lý và ghi cấn trừ
// cọc" (contracts.close, 0.2 #85).
import { fail, ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { COMMON_MESSAGES } from "@/lib/catalog/common";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { businessToday, settleBody } from "@/lib/receivables/respond";
import { settleContract, settlementView } from "@/lib/receivables/settlement";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

export const GET = withAuth<Params>(
  async (_request, { params }) => {
    const view = await settlementView(catalogDb(), params.id, businessToday());
    return view ? ok(view) : fail(COMMON_MESSAGES.notFound, 404);
  },
  { permission: "receivables.view" },
);

export const POST = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, settleBody);
    if (!body.ok) return body.response;
    return respond(
      await settleContract(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        body.data,
      ),
      201,
    );
  },
  { permission: "contracts.close" },
);
