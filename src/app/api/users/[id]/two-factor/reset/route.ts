import { z } from "zod";

import { resetTwoFactorByAdmin } from "@/lib/auth/two-factor-admin";
import { withAuth } from "@/lib/auth/guard";
import { respondTwoFactor, twoFactorDeps } from "@/lib/auth/two-factor-respond";
import { readJson } from "@/lib/read-json";

const bodySchema = z.object({ password: z.string(), code: z.string() });

// The flag, not the role, decides: the service checks it (design D12).
export const POST = withAuth<{ id: string }>(
  async (request, { user, actor, params }) => {
    const body = await readJson(request, bodySchema);
    if (!body.ok) return body.response;
    return respondTwoFactor(
      await resetTwoFactorByAdmin(twoFactorDeps(), {
        admin: user,
        actor,
        targetId: params.id,
        password: body.data.password,
        code: body.data.code,
        headers: request.headers,
      }),
    );
  },
);
