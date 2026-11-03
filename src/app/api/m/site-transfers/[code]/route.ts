import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, NOT_FOUND } from "@/lib/catalog/respond";
import { mobileTransfer } from "@/lib/site-transfers/queries";

type Params = { code: string };

// M9: where from, where to and what the office wrote, never a price.
export const GET = withAuth<Params>(
  async (_request, { params }) => {
    const transfer = await mobileTransfer(catalogDb(), params.code);
    return transfer ? ok(transfer) : NOT_FOUND();
  },
  { permission: "deliveries.pick" },
);
