import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { createSupplier, listSuppliers } from "@/lib/catalog/partners";
import {
  catalogDb,
  respond,
  statusParam,
  supplierBody,
  textParam,
} from "@/lib/catalog/respond";
import { readJson } from "@/lib/read-json";

// Everyone reads the catalog; only "partners.manage" writes (master-data D9).
export const GET = withAuth(
  async (request) => {
    const url = new URL(request.url);
    return ok(
      await listSuppliers(catalogDb(), {
        q: textParam(url, "q"),
        status: statusParam(url),
      }),
    );
  },
  { permission: "catalog.read" },
);

export const POST = withAuth(
  async (request, { user }) => {
    const body = await readJson(request, supplierBody);
    if (!body.ok) return body.response;
    return respond(await createSupplier(catalogDb(), user, body.data), 201);
  },
  { permission: "partners.manage" },
);
