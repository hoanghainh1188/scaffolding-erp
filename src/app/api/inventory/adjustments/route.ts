import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { createAdjustment, listAdjustments } from "@/lib/inventory/adjustments";
import { adjustmentBody, adjustmentStatusFrom } from "@/lib/inventory/respond";
import { readJson } from "@/lib/read-json";

// Office roles read; the accountant and the director draft (design D8).
export const GET = withAuth(
  async (request) => {
    const status = adjustmentStatusFrom(new URL(request.url).searchParams);
    return ok(await listAdjustments(catalogDb(), { status }));
  },
  { permission: "inventory.view" },
);

export const POST = withAuth(
  async (request, { user }) => {
    const body = await readJson(request, adjustmentBody);
    if (!body.ok) return body.response;
    return respond(await createAdjustment(catalogDb(), user, body.data), 201);
  },
  { permission: "inventory.adjust" },
);
