import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { createCustomer, listCustomers } from "@/lib/catalog/partners";
import {
  catalogDb,
  customerBody,
  respond,
  statusParam,
  textParam,
} from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";

// Everyone reads the catalog; only "partners.manage" writes (master-data D9).
export const GET = withAuth(
  async (request) => {
    const url = new URL(request.url);
    return ok(
      await listCustomers(catalogDb(), {
        q: textParam(url, "q"),
        status: statusParam(url),
      }),
    );
  },
  { permission: "catalog.read" },
);

export const POST = withAuth(
  async (request, { actor }) => {
    const body = await readJson(request, customerBody);
    if (!body.ok) return body.response;
    return respond(await createCustomer(catalogDb(), actor, body.data), 201);
  },
  { permission: "partners.manage" },
);
