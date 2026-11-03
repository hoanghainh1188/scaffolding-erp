import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { deliveryBody } from "@/lib/deliveries/respond";
import { createDelivery } from "@/lib/deliveries/service";
import { readJson } from "@/lib/read-json";

/** "Tạo đợt xuất" on D6; the contract type decides who may (canContract). */
export const POST = withAuth(
  async (request, { user, actor }) => {
    const body = await readJson(request, deliveryBody);
    if (!body.ok) return body.response;
    const result = await createDelivery(
      catalogDb(),
      contractActor(user, actor),
      body.data,
    );
    return respond(result, 201);
  },
  { permission: "sales.view" },
);
