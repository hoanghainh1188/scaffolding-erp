// "Hủy" a supplier payment with its reason (payments.manage, 0.2 số 100).
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { cancelPayment } from "@/lib/payables/payments";
import { cancelBody } from "@/lib/payables/respond";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

export const POST = withAuth<Params>(
  async (request, { actor, params }) => {
    const body = await readJson(request, cancelBody);
    if (!body.ok) return body.response;
    return respond(
      await cancelPayment(catalogDb(), actor, params.id, body.data),
    );
  },
  { permission: "payments.manage" },
);
