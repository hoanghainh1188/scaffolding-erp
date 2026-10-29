import { z } from "zod";

import { getDatabase } from "@/db/client";
import { fail, ok } from "@/lib/api-response";
import { getAuth } from "@/lib/auth/auth";
import { changePassword } from "@/lib/auth/change-password";
import { withAuth } from "@/lib/auth/guard";
import { readJson } from "@/lib/read-json";

const bodySchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string(),
  confirmPassword: z.string(),
});

// Allowed while the temporary password is still pending: that is its job.
export const POST = withAuth(
  async (request, { user, actor }) => {
    const body = await readJson(request, bodySchema);
    if (!body.ok) return body.response;
    const result = await changePassword(
      { db: getDatabase(), auth: getAuth() },
      { actor, currentSessionId: user.sessionId, ...body.data },
    );
    return result.ok ? ok(null) : fail(result.error, result.status);
  },
  { allowPendingPasswordChange: true },
);
