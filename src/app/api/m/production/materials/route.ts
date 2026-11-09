import { can } from "@/domain/permissions";
import { fail, ok } from "@/lib/api-response";
import { GUARD_MESSAGES, withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { phoneSupplies } from "@/lib/repairs/phone-queries";

/** "+ Thêm nguyên liệu" on M10: active material items, no price. */
export const GET = withAuth(async (_request, { user }) => {
  if (
    !can(user.role, "production.work") &&
    !can(user.role, "production.count")
  ) {
    return fail(GUARD_MESSAGES.forbidden, 403);
  }
  return ok(await phoneSupplies(catalogDb()));
});
