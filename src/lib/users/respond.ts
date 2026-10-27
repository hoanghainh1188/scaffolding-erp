import { getDatabase } from "@/db/client";
import { fail, ok } from "@/lib/api-response";
import { getAuth } from "@/lib/auth/auth";

import type { ServiceResult, UserServiceDeps } from "./service";

export function userServiceDeps(): UserServiceDeps {
  return { db: getDatabase(), auth: getAuth() };
}

/**
 * Envelope for a service result. A body with a temporary password must not
 * be kept by any cache (design D2).
 */
export function respond<T>(result: ServiceResult<T>, status = 200): Response {
  if (!result.ok) return fail(result.error, result.status);
  const response = ok(result.data, status);
  if (
    result.data &&
    typeof result.data === "object" &&
    "tempPassword" in result.data
  ) {
    response.headers.set("cache-control", "no-store");
  }
  return response;
}
