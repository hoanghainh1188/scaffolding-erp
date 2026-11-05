// What a receipt would settle, nothing written (the D14 form).
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { previewReceipt } from "@/lib/receivables/receipts";
import { receiptBody } from "@/lib/receivables/respond";
import { readJson } from "@/lib/read-json";

export const POST = withAuth(
  async (request, { user, actor }) => {
    const body = await readJson(request, receiptBody);
    if (!body.ok) return body.response;
    return respond(
      await previewReceipt(catalogDb(), contractActor(user, actor), body.data),
    );
  },
  { permission: "receipts.manage" },
);
