import { toBusinessDate } from "@/domain/business-date";
import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { arrivals } from "@/lib/receiving/queries";

// M1 "Xe sắp về bãi" (goods-receipt design D7, D11).
export const GET = withAuth(
  async () => ok(await arrivals(catalogDb(), toBusinessDate(new Date()))),
  { permission: "receiving.manage" },
);
