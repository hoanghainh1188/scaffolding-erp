import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, NOT_FOUND } from "@/lib/catalog/respond";
import { mobileNote } from "@/lib/deliveries/queries";

type Params = { code: string };

// M5: the picking list with yard stock, never a price (design D11).
export const GET = withAuth<Params>(
  async (_request, { params }) => {
    const note = await mobileNote(catalogDb(), params.code);
    return note ? ok(note) : NOT_FOUND();
  },
  { permission: "deliveries.pick" },
);
