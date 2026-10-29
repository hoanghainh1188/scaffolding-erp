import { withAuth } from "@/lib/auth/guard";
import { readJson } from "@/lib/read-json";
import { respond, userServiceDeps } from "@/lib/users/respond";
import { changeRole, changeRoleSchema } from "@/lib/users/service";

export const PATCH = withAuth<{ id: string }>(
  async (request, { actor, params }) => {
    const body = await readJson(request, changeRoleSchema);
    if (!body.ok) return body.response;
    return respond(
      await changeRole(userServiceDeps(), actor, params.id, body.data.role),
    );
  },
  { permission: "users.manage" },
);
