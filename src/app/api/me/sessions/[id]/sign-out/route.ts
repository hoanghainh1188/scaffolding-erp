import { getDatabase } from "@/db/client";
import { withAuth } from "@/lib/auth/guard";
import { signOutDevice } from "@/lib/auth/sessions";
import { respond } from "@/lib/users/respond";

export const POST = withAuth<{ id: string }>(
  async (_request, { user, actor, params }) =>
    respond(
      await signOutDevice(
        { db: getDatabase() },
        {
          actor,
          username: user.username,
          currentSessionId: user.sessionId,
          sessionId: params.id,
        },
      ),
    ),
);
