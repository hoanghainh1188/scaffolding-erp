import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { postReceipt } from "@/lib/receiving/post";
import { receiptsByDay } from "@/lib/receiving/queries";
import { pageFrom, receiptBody } from "@/lib/receiving/respond";
import { readJson } from "@/lib/read-json";

// M7 list and "Xác nhận nhập kho" (goods-receipt design D1, D11).
export const GET = withAuth(
  async (request) =>
    ok(await receiptsByDay(catalogDb(), pageFrom(new URL(request.url)))),
  { permission: "receiving.manage" },
);

/** 201 for a new receipt, 200 when the draft had been posted already. */
export const POST = withAuth(
  async (request, { actor }) => {
    const body = await readJson(request, receiptBody);
    if (!body.ok) return body.response;
    const result = await postReceipt(catalogDb(), actor, body.data);
    return respond(result, result.ok && !result.data.replayed ? 201 : 200);
  },
  { permission: "receiving.manage" },
);
