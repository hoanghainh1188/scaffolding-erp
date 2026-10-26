import type { Role } from "@/domain/role";

import { ConfigError, getEnv, type Env } from "./env";

export interface CurrentUser {
  id: string;
  name: string;
  role: Role;
}

/**
 * The signed-in user. Until auth-and-roles replaces this body with a Better
 * Auth session, development uses a fake user whose role comes from DEV_ROLE.
 * Production refuses rather than letting anyone in as Giám đốc.
 */
export function getCurrentUser(env: Env = getEnv()): CurrentUser {
  if (env.NODE_ENV === "production") {
    throw new ConfigError("Chưa cấu hình đăng nhập");
  }
  return { id: "dev", name: "Người dùng thử", role: env.DEV_ROLE };
}
