import { getDatabase } from "@/db/client";
import { withAuth } from "@/lib/auth/guard";
import { signOutOtherDevices } from "@/lib/auth/sessions";
import { respond } from "@/lib/users/respond";

export const POST = withAuth(async (_request, { user, actor }) =>
  respond(
    await signOutOtherDevices(
      { db: getDatabase() },
      {
        actor,
        username: user.username,
        currentSessionId: user.sessionId,
      },
    ),
  ),
);
