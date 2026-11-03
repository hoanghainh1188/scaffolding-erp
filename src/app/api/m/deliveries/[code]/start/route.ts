// Bắt đầu nhặt: the note turns PICKING (needs the network).
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor, reasonBody } from "@/lib/contracts/respond";
import { changeDeliveryStatus } from "@/lib/deliveries/service";
import { readJson } from "@/lib/read-json";

type Params = { code: string };

export const POST = withAuth<Params>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, reasonBody);
    if (!body.ok) return body.response;
    return respond(
      await changeDeliveryStatus(
        catalogDb(),
        contractActor(user, actor),
        params.code,
        "START",
        body.data.reason ?? null,
      ),
    );
  },
  { permission: "deliveries.pick" },
);
