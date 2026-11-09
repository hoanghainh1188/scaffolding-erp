import { getDatabase } from "@/db/client";
import { fail, ok } from "@/lib/api-response";

import { getAuth } from "./auth";
import type { TwoFactorDeps, TwoFactorResult } from "./two-factor";

export function twoFactorDeps(): TwoFactorDeps {
  return { db: getDatabase(), auth: getAuth() };
}

/** Envelope for a result; bodies may hold secrets, so no cache keeps them. */
export function respondTwoFactor<T>(result: TwoFactorResult<T>): Response {
  const response = result.ok
    ? ok(result.data)
    : fail(result.error, result.status);
  response.headers.set("cache-control", "no-store");
  if (result.ok) {
    for (const cookie of result.setCookies ?? []) {
      response.headers.append("set-cookie", cookie);
    }
  }
  return response;
}
