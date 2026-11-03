// Hủy phiếu (lý do bắt buộc): the office, by contract type.
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor, reasonBody } from "@/lib/contracts/respond";
import { changeDeliveryStatus } from "@/lib/deliveries/service";
import { readJson } from "@/lib/read-json";

type Params = { id: string };

export const POST = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, reasonBody);
    if (!body.ok) return body.response;
    return respond(
      await changeDeliveryStatus(
        catalogDb(),
        contractActor(user, actor),
        params.id,
        "CANCEL",
        body.data.reason ?? null,
      ),
    );
  },
  { permission: "sales.view" },
);
