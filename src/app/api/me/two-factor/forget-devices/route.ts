import { canManageTwoFactor } from "@/domain/permissions";
import { fail } from "@/lib/api-response";
import { GUARD_MESSAGES, withAuth } from "@/lib/auth/guard";
import { forgetDevices } from "@/lib/auth/two-factor";
import { respondTwoFactor, twoFactorDeps } from "@/lib/auth/two-factor-respond";

export const POST = withAuth(async (_request, { user, actor }) => {
  if (!canManageTwoFactor(user)) return fail(GUARD_MESSAGES.forbidden, 403);
  return respondTwoFactor(
    await forgetDevices(twoFactorDeps(), {
      actor,
      username: user.username,
    }),
  );
});
