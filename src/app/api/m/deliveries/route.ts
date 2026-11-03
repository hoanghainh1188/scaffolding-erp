import { toBusinessDate } from "@/domain/business-date";
import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { mobileTasks } from "@/lib/deliveries/queries";

// M1 "Xuất hàng": notes waiting or being picked, due by today. No prices.
export const GET = withAuth(
  async () => ok(await mobileTasks(catalogDb(), toBusinessDate(new Date()))),
  { permission: "deliveries.pick" },
);
