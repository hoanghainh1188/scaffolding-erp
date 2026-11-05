// "Ghi phiếu thu" (receipts.manage).
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { recordReceipt } from "@/lib/receivables/receipts";
import { receiptBody } from "@/lib/receivables/respond";
import { readJson } from "@/lib/read-json";

export const POST = withAuth(
  async (request, { user, actor }) => {
    const body = await readJson(request, receiptBody);
    if (!body.ok) return body.response;
    return respond(
      await recordReceipt(catalogDb(), contractActor(user, actor), body.data),
      201,
    );
  },
  { permission: "receipts.manage" },
);
