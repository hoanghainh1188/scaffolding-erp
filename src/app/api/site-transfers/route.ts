import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { readJson } from "@/lib/read-json";
import { createAndPostSiteTransfer } from "@/lib/site-transfers/post";
import { transferBody } from "@/lib/site-transfers/respond";
import { createSiteTransfer } from "@/lib/site-transfers/service";

/**
 * D6b "Lưu nháp", or "Xác nhận chuyển" before saving (`confirm`): both
 * contracts decide who may (canContract, site-operations design D7).
 */
export const POST = withAuth(
  async (request, { user, actor }) => {
    const body = await readJson(request, transferBody);
    if (!body.ok) return body.response;
    const who = contractActor(user, actor);
    const { confirm, ...data } = body.data;
    return confirm
      ? respond(await createAndPostSiteTransfer(catalogDb(), who, data), 201)
      : respond(await createSiteTransfer(catalogDb(), who, data), 201);
  },
  { permission: "sales.view" },
);
