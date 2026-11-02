import { toBusinessDate } from "@/domain/business-date";
import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { listContracts } from "@/lib/contracts/list";
import {
  contractActor,
  contractBody,
  contractFilterFrom,
} from "@/lib/contracts/respond";
import { createContract } from "@/lib/contracts/service";
import { readJson } from "@/lib/read-json";

// Office roles reach the routes; canContract (role + scope) decides per
// contract type inside (contracts design D8).
export const GET = withAuth(
  async (request, { user, actor }) => {
    const filter = contractFilterFrom(new URL(request.url).searchParams);
    return ok(
      await listContracts(
        catalogDb(),
        contractActor(user, actor),
        filter,
        toBusinessDate(new Date()),
      ),
    );
  },
  { permission: "sales.view" },
);

/** "Lưu nháp" the first time: issues the number. */
export const POST = withAuth(
  async (request, { user, actor }) => {
    const body = await readJson(request, contractBody);
    if (!body.ok) return body.response;
    return respond(
      await createContract(catalogDb(), contractActor(user, actor), body.data),
      201,
    );
  },
  { permission: "sales.view" },
);
