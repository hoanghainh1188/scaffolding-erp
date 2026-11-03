import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { returnContract } from "@/lib/returns/queries";

type Params = { id: string };

// M4 step 2: what is at the contract's site, never a price (design D11).
export const GET = withAuth<Params>(
  async (_request, { params }) =>
    respond(await returnContract(catalogDb(), params.id)),
  { permission: "returns.receive" },
);
