import { can } from "@/domain/permissions";
import { fail, ok } from "@/lib/api-response";
import { GUARD_MESSAGES, withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { phoneOrders, phoneStatuses } from "@/lib/repairs/phone-queries";

/** M8 list: the workshop's orders and the storekeeper's counts, no price. */
export const GET = withAuth(async (_request, { user }) => {
  const scope = {
    work: can(user.role, "repairs.work"),
    count: can(user.role, "repairs.count"),
  };
  if (!scope.work && !scope.count) {
    return fail(GUARD_MESSAGES.forbidden, 403);
  }
  return ok(await phoneOrders(catalogDb(), phoneStatuses(scope)));
});
