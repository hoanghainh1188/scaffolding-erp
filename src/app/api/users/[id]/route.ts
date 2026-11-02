import { withAuth } from "@/lib/auth/guard";
import { readJson } from "@/lib/read-json";
import { respond, userServiceDeps } from "@/lib/users/respond";
import {
  changeContractScope,
  changeRole,
  updateUserSchema,
} from "@/lib/users/service";

/** A new role, or a new contract scope for a SALES account (0.2 #51). */
export const PATCH = withAuth<{ id: string }>(
  async (request, { actor, params }) => {
    const body = await readJson(request, updateUserSchema);
    if (!body.ok) return body.response;
    const data = body.data;
    return respond(
      "role" in data
        ? await changeRole(userServiceDeps(), actor, params.id, data.role)
        : await changeContractScope(
            userServiceDeps(),
            actor,
            params.id,
            data.contractScope,
          ),
    );
  },
  { permission: "users.manage" },
);
