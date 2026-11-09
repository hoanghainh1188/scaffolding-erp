import { can } from "@/domain/permissions";
import { fail, ok } from "@/lib/api-response";
import { GUARD_MESSAGES, withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb } from "@/lib/catalog/respond";
import { productionPhoneOrder } from "@/lib/production/phone-queries";
import { PRODUCTION_CODE } from "@/lib/production/respond";

type Params = { code: string };

export const GET = withAuth<Params>(async (_request, { user, params }) => {
  if (
    !can(user.role, "production.work") &&
    !can(user.role, "production.count")
  ) {
    return fail(GUARD_MESSAGES.forbidden, 403);
  }
  if (!PRODUCTION_CODE.test(params.code)) return NOT_FOUND();
  const found = await productionPhoneOrder(catalogDb(), params.code);
  return found ? ok(found) : NOT_FOUND();
});
