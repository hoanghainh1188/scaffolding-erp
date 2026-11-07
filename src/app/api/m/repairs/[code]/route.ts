import { can } from "@/domain/permissions";
import { fail, ok } from "@/lib/api-response";
import { GUARD_MESSAGES, withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb } from "@/lib/catalog/respond";
import { phoneOrder } from "@/lib/repairs/phone-queries";
import { REPAIR_CODE } from "@/lib/repairs/respond";

type Params = { code: string };

/** One order for M8: numbers and supplies, never a price (design D6). */
export const GET = withAuth<Params>(async (_request, { user, params }) => {
  if (!can(user.role, "repairs.work") && !can(user.role, "repairs.count")) {
    return fail(GUARD_MESSAGES.forbidden, 403);
  }
  if (!REPAIR_CODE.test(params.code)) return NOT_FOUND();
  const found = await phoneOrder(catalogDb(), params.code);
  return found ? ok(found) : NOT_FOUND();
});
