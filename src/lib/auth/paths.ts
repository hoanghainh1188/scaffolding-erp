// Pure path rules shared by the proxy, the guards and the sign-in page.
import { defaultSurfaceForRole, type Role } from "@/domain/role";

export const LOGIN_PATH = "/login";
export const CHANGE_PASSWORD_PATH = "/change-password";

const PUBLIC_EXACT = new Set([
  LOGIN_PATH,
  "/api/health",
  "/manifest.webmanifest",
  "/favicon.ico",
]);
const PUBLIC_PREFIXES = ["/api/auth/", "/icons/", "/_next/"];

/** Paths anyone may open without signing in (spec auth). */
export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_EXACT.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

/** Where a role lands after sign-in: the office or the phone area. */
export function homePathFor(role: Role): string {
  return defaultSurfaceForRole(role) === "MOBILE" ? "/m" : "/dashboard";
}

/**
 * `next` only if it is a path on this site: starts with one "/", no
 * scheme, no "//host" or "/\host" tricks, not the login page itself.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  if (next.includes("\\") || /[\u0000-\u001f]/.test(next)) return null;
  const url = new URL(next, "http://app.invalid");
  // Parsing folds "/.//x" or "/%2e//x" into "//x", a link to host x:
  // check what comes out, not only what went in.
  if (
    url.origin !== "http://app.invalid" ||
    url.pathname.startsWith("//") ||
    url.pathname === LOGIN_PATH
  ) {
    return null;
  }
  return `${url.pathname}${url.search}`;
}

/** /login, carrying the page to come back to when there is one. */
export function loginPathFor(next: string | null | undefined): string {
  const safe = safeNextPath(next);
  return safe && safe !== "/"
    ? `${LOGIN_PATH}?next=${encodeURIComponent(safe)}`
    : LOGIN_PATH;
}

/** After sign-in: the requested page, else the role's home. */
export function afterSignInPath(
  role: Role,
  next: string | null | undefined,
): string {
  return safeNextPath(next) ?? homePathFor(role);
}
