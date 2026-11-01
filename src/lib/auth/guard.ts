// Server-side permission checks for pages and route handlers (design D7).
// Hiding a menu item is cosmetic; these are the real gate.
import { forbidden, redirect } from "next/navigation";
import { headers } from "next/headers";

import { can, type Permission } from "@/domain/permissions";
import { actorFromRequest, type ActivityActor } from "@/lib/activity/actor";
import { fail } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/current-user";

import { getAuth } from "./auth";
import { CHANGE_PASSWORD_PATH, loginPathFor } from "./paths";
import { resolveCurrentUser, type CurrentUser } from "./session";

export const GUARD_MESSAGES = {
  signedOut: "Bạn cần đăng nhập",
  forbidden: "Bạn không có quyền thực hiện thao tác này",
  mustChangePassword: "Cần đổi mật khẩu trước khi tiếp tục",
  badOrigin: "Yêu cầu không hợp lệ",
} as const;

/** Request header the proxy sets so pages know where to come back to. */
export const PATH_HEADER = "x-erp-path";

interface RequireUserOptions {
  /** Only the change-password page may be shown before the change. */
  allowPendingPasswordChange?: boolean;
}

/** For pages: the signed-in user, or a redirect to /login. */
export async function requireUser(
  options: RequireUserOptions = {},
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(loginPathFor((await headers()).get(PATH_HEADER)));
  }
  if (user.mustChangePassword && !options.allowPendingPasswordChange) {
    redirect(CHANGE_PASSWORD_PATH);
  }
  return user;
}

/** For pages: the signed-in user if their role has `permission`, else 403. */
export async function requirePermission(
  permission: Permission,
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) forbidden();
  return user;
}

export interface GuardOptions {
  permission?: Permission;
  allowPendingPasswordChange?: boolean;
}

export interface GuardedContext<P> {
  user: CurrentUser;
  /** The user as the activity log records them (activity-log design D4). */
  actor: ActivityActor;
  params: P;
}

type RouteContext<P> = { params: Promise<P> };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Wraps a route handler: same-origin check for writes (CSRF), then 401 when
 * signed out, 403 for a pending password change or a missing permission.
 */
export function withAuth<P = Record<string, never>>(
  handler: (request: Request, context: GuardedContext<P>) => Promise<Response>,
  options: GuardOptions = {},
) {
  return async (
    request: Request,
    context: RouteContext<P> = { params: Promise.resolve({} as P) },
  ): Promise<Response> => {
    if (!SAFE_METHODS.has(request.method) && !isSameOrigin(request)) {
      return fail(GUARD_MESSAGES.badOrigin, 403);
    }
    // Headers first: a GET-only route is prerendered at build time, and
    // reading the request is what tells Next.js it is dynamic. Only then
    // may the auth configuration (environment variables) be needed.
    const headers = request.headers;
    const user = await resolveCurrentUser(getAuth(), headers);
    if (!user) return fail(GUARD_MESSAGES.signedOut, 401);
    if (user.mustChangePassword && !options.allowPendingPasswordChange) {
      return fail(GUARD_MESSAGES.mustChangePassword, 403);
    }
    if (options.permission && !can(user.role, options.permission)) {
      return fail(GUARD_MESSAGES.forbidden, 403);
    }
    return handler(request, {
      user,
      actor: actorFromRequest(user, headers),
      params: await context.params,
    });
  };
}

/**
 * CSRF check for writes: the browser's Origin must be this site, either the
 * configured public URL or the address the request was sent to (the same
 * test Next.js applies to Server Actions). Another site's page cannot fake
 * its Origin header.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return false;
  const baseURL = getAuth().options.baseURL;
  const allowed = [new URL(request.url).origin];
  if (typeof baseURL === "string") allowed.push(new URL(baseURL).origin);
  return allowed.includes(origin);
}
