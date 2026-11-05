// "Hủy" a receipt with its reason (receipts.manage, 0.2 #83).
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { cancelReceipt } from "@/lib/receivables/receipts";
import { cancelBody } from "@/lib/receivables/respond";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

export const POST = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, cancelBody);
    if (!body.ok) return body.response;
    return respond(
      await cancelReceipt(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        body.data,
      ),
    );
  },
  { permission: "receipts.manage" },
);
