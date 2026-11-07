import { can } from "@/domain/permissions";
import { fail, ok } from "@/lib/api-response";
import { GUARD_MESSAGES, withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { phoneSupplies } from "@/lib/repairs/phone-queries";

/** "+ Thêm vật tư" on M8: active supply items, no price. */
export const GET = withAuth(async (_request, { user }) => {
  if (!can(user.role, "repairs.work") && !can(user.role, "repairs.count")) {
    return fail(GUARD_MESSAGES.forbidden, 403);
  }
  return ok(await phoneSupplies(catalogDb()));
});
