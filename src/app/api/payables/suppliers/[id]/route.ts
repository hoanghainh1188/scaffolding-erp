// D14c, one seller: receipts and payments; CCCD and bank account masked.
import { fail, ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { COMMON_MESSAGES } from "@/lib/catalog/common";
import { catalogDb } from "@/lib/catalog/respond";
import { supplierDetail } from "@/lib/payables/queries";
import { businessToday } from "@/lib/payables/respond";
import { isUuid } from "@/lib/deliveries/records";

type Params = { id: string };

export const GET = withAuth<Params>(
  async (request, { params }) => {
    if (!isUuid(params.id)) return fail(COMMON_MESSAGES.notFound, 404);
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("payments") ?? "");
    const detail = await supplierDetail(
      catalogDb(),
      params.id,
      businessToday(),
      {
        showPaid: url.searchParams.get("paid") === "1",
        paymentLimit:
          Number.isInteger(limit) && limit > 0
            ? Math.min(limit, 500)
            : undefined,
      },
    );
    return detail ? ok(detail) : fail(COMMON_MESSAGES.notFound, 404);
  },
  { permission: "payables.view" },
);
