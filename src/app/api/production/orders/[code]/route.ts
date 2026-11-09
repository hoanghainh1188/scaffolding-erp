import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, respond } from "@/lib/catalog/respond";
import {
  deleteProductionOrder,
  updateProductionOrder,
} from "@/lib/production/orders";
import { getProductionOrder } from "@/lib/production/queries";
import {
  PRODUCTION_CODE,
  deleteBody,
  orderBody,
} from "@/lib/production/respond";
import { readJson } from "@/lib/read-json";

type Params = { code: string };

export const GET = withAuth<Params>(
  async (_request, { params }) => {
    if (!PRODUCTION_CODE.test(params.code)) return NOT_FOUND();
    const found = await getProductionOrder(catalogDb(), params.code);
    return found ? ok(found) : NOT_FOUND();
  },
  { permission: "production.view" },
);

export const PATCH = withAuth<Params>(
  async (request, { actor, params }) => {
    if (!PRODUCTION_CODE.test(params.code)) return NOT_FOUND();
    const body = await readJson(request, orderBody);
    if (!body.ok) return body.response;
    return respond(
      await updateProductionOrder(catalogDb(), actor, params.code, body.data),
    );
  },
  { permission: "production.manage" },
);

export const DELETE = withAuth<Params>(
  async (request, { actor, params }) => {
    if (!PRODUCTION_CODE.test(params.code)) return NOT_FOUND();
    const body = await readJson(request, deleteBody);
    if (!body.ok) return body.response;
    return respond(
      await deleteProductionOrder(catalogDb(), actor, params.code, body.data),
    );
  },
  { permission: "production.manage" },
);
