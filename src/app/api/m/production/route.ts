import { can } from "@/domain/permissions";
import { fail, ok } from "@/lib/api-response";
import { GUARD_MESSAGES, withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import {
  productionPhoneOrders,
  productionPhoneStatuses,
} from "@/lib/production/phone-queries";

/** M10 list: the workshop's orders and the storekeeper's counts, no price. */
export const GET = withAuth(async (_request, { user }) => {
  const scope = {
    work: can(user.role, "production.work"),
    count: can(user.role, "production.count"),
  };
  if (!scope.work && !scope.count) {
    return fail(GUARD_MESSAGES.forbidden, 403);
  }
  return ok(
    await productionPhoneOrders(catalogDb(), productionPhoneStatuses(scope)),
  );
});
