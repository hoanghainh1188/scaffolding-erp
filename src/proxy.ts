import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { fail } from "@/lib/api-response";
import { getAuth } from "@/lib/auth/auth";
import { GUARD_MESSAGES, PATH_HEADER } from "@/lib/auth/guard";
import { isPublicPath, loginPathFor } from "@/lib/auth/paths";
import { buildCspHeader, generateNonce } from "@/lib/security/csp";

/**
 * Early, cheap gate (design D7): no session cookie means /login for pages
 * and 401 for APIs. Whether the session is valid, and what the role may do,
 * is decided on the server by requireUser/requirePermission/withAuth.
 */
export async function proxy(request: NextRequest): Promise<Response> {
  const { pathname, search } = request.nextUrl;

  const isHtmlPage =
    !pathname.startsWith("/api/") &&
    !pathname.endsWith(".webmanifest") &&
    !pathname.endsWith(".ico");

  const nonce = isHtmlPage ? generateNonce() : null;
  const cspHeader = nonce ? buildCspHeader({ nonce }) : null;

  const forwarded = new Headers(request.headers);
  if (nonce && cspHeader) {
    forwarded.set("x-nonce", nonce);
    forwarded.set("Content-Security-Policy", cspHeader);
  }

  if (isPublicPath(pathname)) {
    const response = NextResponse.next({ request: { headers: forwarded } });
    if (cspHeader) {
      response.headers.set("Content-Security-Policy", cspHeader);
    }
    return response;
  }

  if (!getSessionCookie(request)) {
    if (pathname.startsWith("/api/")) {
      return fail(GUARD_MESSAGES.signedOut, 401);
    }
    const target = new URL(loginPathFor(`${pathname}${search}`), request.url);
    return NextResponse.redirect(target);
  }

  // Pages read this to build /login?next=... when the session turns out
  // to be invalid.
  forwarded.set(PATH_HEADER, `${pathname}${search}`);
  const response = NextResponse.next({ request: { headers: forwarded } });
  if (cspHeader) {
    response.headers.set("Content-Security-Policy", cspHeader);
  }
  if (!pathname.startsWith("/api/"))
    await renewSessionCookie(request, response);
  return response;
}

/**
 * Server Components cannot set cookies, so the once-a-day renewal of a
 * "Giữ đăng nhập" session (30 days since last use, D1) happens here.
 */
async function renewSessionCookie(
  request: NextRequest,
  response: NextResponse,
): Promise<void> {
  try {
    const { headers } = await getAuth().api.getSession({
      headers: request.headers,
      returnHeaders: true,
    });
    for (const cookie of headers.getSetCookie()) {
      response.headers.append("set-cookie", cookie);
    }
  } catch (error: unknown) {
    // The page's own check still runs; renewal can wait for the next visit.
    console.error("[auth] session renewal failed", error);
  }
}

export const config = {
  // Static files and images never need a session.
  matcher: ["/((?!_next/static|_next/image|icons/|favicon.ico).*)"],
};
