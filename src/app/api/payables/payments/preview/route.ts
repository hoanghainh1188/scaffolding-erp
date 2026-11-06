// What a supplier payment would settle, without writing (payments.manage).
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { previewPayment } from "@/lib/payables/payments";
import { paymentBody } from "@/lib/payables/respond";
import { readJson } from "@/lib/read-json";

export const POST = withAuth(
  async (request, { actor }) => {
    const body = await readJson(request, paymentBody);
    if (!body.ok) return body.response;
    return respond(await previewPayment(catalogDb(), actor, body.data));
  },
  { permission: "payments.manage" },
);
