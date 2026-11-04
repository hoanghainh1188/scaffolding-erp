// D7 "Thêm dòng điều chỉnh" (billing.manage).
import { withAuth } from "@/lib/auth/guard";
import { createAdjustment } from "@/lib/billing/adjustments";
import { adjustmentBody } from "@/lib/billing/respond";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";

export const POST = withAuth(
  async (request, { actor }) => {
    const body = await readJson(request, adjustmentBody);
    if (!body.ok) return body.response;
    return respond(await createAdjustment(catalogDb(), actor, body.data), 201);
  },
  { permission: "billing.manage" },
);
