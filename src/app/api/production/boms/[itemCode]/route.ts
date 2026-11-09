import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb, respond } from "@/lib/catalog/respond";
import { createBom, deleteBom, updateBom } from "@/lib/production/boms";
import { getBom } from "@/lib/production/queries";
import { bomBody } from "@/lib/production/respond";
import { readJson } from "@/lib/read-json";

type Params = { itemCode: string };

export const GET = withAuth<Params>(
  async (_request, { params }) => {
    const found = await getBom(catalogDb(), params.itemCode);
    return found ? ok(found) : NOT_FOUND();
  },
  { permission: "production.view" },
);

/** Without updatedAt it creates; with it, it edits what the form opened. */
export const PUT = withAuth<Params>(
  async (request, { actor, params }) => {
    const body = await readJson(request, bomBody);
    if (!body.ok) return body.response;
    const save = body.data.updatedAt ? updateBom : createBom;
    return respond(await save(catalogDb(), actor, params.itemCode, body.data));
  },
  { permission: "production.manage" },
);

export const DELETE = withAuth<Params>(
  async (_request, { actor, params }) =>
    respond(await deleteBom(catalogDb(), actor, params.itemCode)),
  { permission: "production.manage" },
);
