import { getDatabase } from "@/db/client";
import { isRole } from "@/domain/role";
import { fail, ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { readJson } from "@/lib/read-json";
import { respond, userServiceDeps } from "@/lib/users/respond";
import { createUser, createUserSchema, listUsers } from "@/lib/users/service";

/** D17 list; `?role=WAREHOUSE` filters, the counts always cover everyone. */
export const GET = withAuth(
  async (request) => {
    const role = new URL(request.url).searchParams.get("role");
    if (role !== null && !isRole(role))
      return fail("Vai trò không hợp lệ", 400);
    return ok(await listUsers(getDatabase(), { role: role ?? undefined }));
  },
  { permission: "users.manage" },
);

export const POST = withAuth(
  async (request) => {
    const body = await readJson(request, createUserSchema);
    if (!body.ok) return body.response;
    return respond(await createUser(userServiceDeps(), body.data), 201);
  },
  { permission: "users.manage" },
);
