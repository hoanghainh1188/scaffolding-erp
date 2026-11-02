import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { codePreview } from "@/lib/contracts/queries";
import { contractActor } from "@/lib/contracts/respond";

/** D5a: the number a first save would issue, nothing taken. */
export const GET = withAuth(
  async (request, { user, actor }) => {
    const params = new URL(request.url).searchParams;
    return respond(
      await codePreview(catalogDb(), contractActor(user, actor), {
        customerId: params.get("customerId"),
        startDate: params.get("startDate"),
        customerToken: params.get("customerToken"),
      }),
    );
  },
  { permission: "sales.view" },
);
