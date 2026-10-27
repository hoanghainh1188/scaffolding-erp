import { sql } from "drizzle-orm";

import { authRateLimit } from "@/db/schema";

import type { Executor } from "./credentials";

/** Default; AUTH_SIGN_IN_LIMIT_PER_MINUTE overrides it. */
export const SIGN_IN_LIMIT_PER_WINDOW = 20;
export const SIGN_IN_WINDOW_SECONDS = 60;

/**
 * Client address from the last X-Forwarded-For entry: the reverse proxy
 * appends the real peer there, and `next start` fills it from the socket when
 * absent. Without a proxy a client can forge it (design D3).
 */
export function clientIp(headers: Headers): string {
  const entries = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.at(-1) ?? "unknown";
}

/**
 * Counts one sign-in attempt for `ip` in fixed one-minute windows, in a
 * single statement so concurrent attempts never lose a count. Returns
 * whether this attempt is within the limit.
 */
export async function consumeSignInAttempt(
  db: Executor,
  ip: string,
  now: Date,
  limit: number = SIGN_IN_LIMIT_PER_WINDOW,
): Promise<boolean> {
  const key = `sign-in:${ip}`;
  // Raw sql`` params are not mapped by column type: pass ISO text.
  const nowParam = sql`${now.toISOString()}::timestamptz`;
  const fresh = sql`${authRateLimit.windowStart} <= ${nowParam} - make_interval(secs => ${SIGN_IN_WINDOW_SECONDS})`;
  const [row] = await db
    .insert(authRateLimit)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: authRateLimit.key,
      set: {
        windowStart: sql`case when ${fresh} then ${nowParam} else ${authRateLimit.windowStart} end`,
        count: sql`case when ${fresh} then 1 else ${authRateLimit.count} + 1 end`,
      },
    })
    .returning({ count: authRateLimit.count });
  return (row?.count ?? 1) <= limit;
}
