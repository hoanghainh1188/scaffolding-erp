import { withAuth } from "@/lib/auth/guard";
import { respond, userServiceDeps } from "@/lib/users/respond";
import { lockUser } from "@/lib/users/service";

export const POST = withAuth<{ id: string }>(
  async (_request, { actor, params }) =>
    respond(await lockUser(userServiceDeps(), actor, params.id)),
  { permission: "users.manage" },
);
