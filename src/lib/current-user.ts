import { getSessionCookie } from "better-auth/cookies";
import { headers } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";

import { getAuth } from "@/lib/auth/auth";
import { resolveCurrentUser, type CurrentUser } from "@/lib/auth/session";

export type { CurrentUser };

/**
 * The signed-in user for this request, or null. Reads request headers, so
 * callers render at request time (inside <Suspense> with Cache Components).
 * Cached per request: layout and page share one database lookup.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // headers() first: it makes the caller request-time. No session cookie
  // means nobody is signed in, without touching env or the database (the
  // build renders pages once with empty headers).
  const requestHeaders = await headers();
  if (!getSessionCookie(requestHeaders)) return null;
  // Session checks compare against the clock; mark this as request-time
  // work so Next does not treat the time as part of a prerender.
  await connection();
  return resolveCurrentUser(getAuth(), requestHeaders);
});
