import { RECEIPT_MESSAGES } from "@/domain/goods-receipt";
import { can } from "@/domain/permissions";
import { fail, ok } from "@/lib/api-response";
import { GUARD_MESSAGES, withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { receiptByCode } from "@/lib/receiving/queries";
import { RECEIPT_CODE } from "@/lib/receiving/respond";

type Params = { code: string };

const NOT_FOUND = () => fail(RECEIPT_MESSAGES.notFound, 404);

/** A posted receipt: the storekeeper, or office roles that read orders. */
export const GET = withAuth<Params>(async (_request, { user, params }) => {
  if (
    !can(user.role, "receiving.manage") &&
    !can(user.role, "purchasing.view")
  ) {
    return fail(GUARD_MESSAGES.forbidden, 403);
  }
  if (!RECEIPT_CODE.test(params.code)) return NOT_FOUND();
  const found = await receiptByCode(catalogDb(), params.code);
  return found ? ok(found) : NOT_FOUND();
});
