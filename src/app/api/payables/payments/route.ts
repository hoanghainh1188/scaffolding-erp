// "Ghi phiếu chi" (payments.manage, 0.2 số 103).
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { recordPayment } from "@/lib/payables/payments";
import { paymentBody } from "@/lib/payables/respond";
import { readJson } from "@/lib/read-json";

export const POST = withAuth(
  async (request, { actor }) => {
    const body = await readJson(request, paymentBody);
    if (!body.ok) return body.response;
    return respond(await recordPayment(catalogDb(), actor, body.data), 201);
  },
  { permission: "payments.manage" },
);
