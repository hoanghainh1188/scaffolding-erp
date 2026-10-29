import { withAuth } from "@/lib/auth/guard";
import { respond, userServiceDeps } from "@/lib/users/respond";
import { unlockUser } from "@/lib/users/service";

export const POST = withAuth<{ id: string }>(
  async (_request, { actor, params }) =>
    respond(await unlockUser(userServiceDeps(), actor, params.id)),
  { permission: "users.manage" },
);
