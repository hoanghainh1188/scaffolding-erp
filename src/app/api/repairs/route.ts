import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";
import { createRepairDraft } from "@/lib/repairs/orders";
import { listRepairOrders } from "@/lib/repairs/queries";
import { repairBody, repairStatusFrom } from "@/lib/repairs/respond";

// Office roles read; the director and the accountant draft (design D4).
export const GET = withAuth(
  async (request) => {
    const status = repairStatusFrom(
      new URL(request.url).searchParams.get("status"),
    );
    return ok(await listRepairOrders(catalogDb(), { status }));
  },
  { permission: "repairs.view" },
);

export const POST = withAuth(
  async (request, { actor }) => {
    const body = await readJson(request, repairBody);
    if (!body.ok) return body.response;
    return respond(await createRepairDraft(catalogDb(), actor, body.data), 201);
  },
  { permission: "repairs.manage" },
);
