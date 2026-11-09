import { z } from "zod";

import { canManageTwoFactor } from "@/domain/permissions";
import { fail } from "@/lib/api-response";
import { GUARD_MESSAGES, withAuth } from "@/lib/auth/guard";
import { confirmTwoFactorSetup } from "@/lib/auth/two-factor";
import { respondTwoFactor, twoFactorDeps } from "@/lib/auth/two-factor-respond";
import { readJson } from "@/lib/read-json";

const bodySchema = z.object({ code: z.string() });

export const POST = withAuth(
  async (request, { user, actor }) => {
    if (!canManageTwoFactor(user)) return fail(GUARD_MESSAGES.forbidden, 403);
    const body = await readJson(request, bodySchema);
    if (!body.ok) return body.response;
    return respondTwoFactor(
      await confirmTwoFactorSetup(twoFactorDeps(), {
        actor,
        username: user.username,
        twoFactorEnabled: user.twoFactorEnabled,
        code: body.data.code,
        headers: request.headers,
      }),
    );
  },
  { allowPendingTwoFactor: true },
);
