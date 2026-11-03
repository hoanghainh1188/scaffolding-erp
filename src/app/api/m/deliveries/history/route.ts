import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { deliveriesByDay } from "@/lib/deliveries/queries";
import { pageFrom } from "@/lib/receiving/respond";

// M7 "Xuất": posted notes by delivery day, newest first. No prices.
export const GET = withAuth(
  async (request) =>
    ok(await deliveriesByDay(catalogDb(), pageFrom(new URL(request.url)))),
  { permission: "deliveries.pick" },
);
