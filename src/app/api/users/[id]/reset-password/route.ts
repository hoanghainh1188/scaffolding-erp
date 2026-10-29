import { withAuth } from "@/lib/auth/guard";
import { respond, userServiceDeps } from "@/lib/users/respond";
import { resetPassword } from "@/lib/users/service";

export const POST = withAuth<{ id: string }>(
  async (_request, { actor, params }) =>
    respond(await resetPassword(userServiceDeps(), actor, params.id)),
  { permission: "users.manage" },
);
