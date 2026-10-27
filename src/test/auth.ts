// Integration-test helpers for real sign-in against TEST_DATABASE_URL.
import { sql } from "drizzle-orm";

import { createDatabase, type DatabaseHandle } from "@/db/client";
import type { Role } from "@/domain/role";
import { createAuth, type Auth } from "@/lib/auth/auth";
import { insertUser, type UserStatus } from "@/lib/auth/credentials";

export const TEST_SECRET = "integration-test-secret-0123456789abcdef";
export const TEST_BASE_URL = "http://localhost:3000";
export const TEST_PASSWORD = "test-pass-1234";

export interface TestContext extends DatabaseHandle {
  auth: Auth;
}

export function createTestContext(): TestContext {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is required for integration tests.");
  }
  const handle = createDatabase(url);
  const auth = createAuth({
    db: handle.db,
    secret: TEST_SECRET,
    baseURL: TEST_BASE_URL,
  });
  return { ...handle, auth };
}

/**
 * Makes getDatabase() and getAuth() return the test instances, so route
 * handlers can be called directly. Returns a function that undoes it.
 */
export function installTestContext(ctx: TestContext): () => void {
  const store = globalThis as typeof globalThis & {
    __erpDatabase?: DatabaseHandle;
    __erpAuth?: Auth;
  };
  const previous = { db: store.__erpDatabase, auth: store.__erpAuth };
  store.__erpDatabase = ctx;
  store.__erpAuth = ctx.auth;
  return () => {
    store.__erpDatabase = previous.db;
    store.__erpAuth = previous.auth;
  };
}

/** A request to the app as a browser on the same origin would send it. */
export function appRequest(
  path: string,
  init: { method?: string; cookie?: string; body?: unknown } = {},
): Request {
  const headers = new Headers({ origin: TEST_BASE_URL });
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`${TEST_BASE_URL}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

/** Empties every auth table; call in beforeEach. */
export async function resetAuthTables({ db }: TestContext): Promise<void> {
  await db.execute(
    sql`truncate table "user", "session", "account", "verification", "rate_limit", "login_throttle", "auth_rate_limit" cascade`,
  );
}

export interface TestUserOptions {
  role: Role;
  username?: string;
  name?: string;
  status?: UserStatus;
  mustChangePassword?: boolean;
  password?: string;
}

export interface TestUser {
  id: string;
  username: string;
  password: string;
  role: Role;
}

let counter = 0;

export async function createTestUser(
  { db, auth }: TestContext,
  options: TestUserOptions,
): Promise<TestUser> {
  counter += 1;
  const username = options.username ?? `user${counter}`;
  const password = options.password ?? TEST_PASSWORD;
  const id = await insertUser(db, auth, {
    name: options.name ?? `Người dùng ${counter}`,
    username,
    role: options.role,
    password,
    status: options.status,
    mustChangePassword: options.mustChangePassword ?? false,
  });
  return { id, username, password, role: options.role };
}

/** Cookie header for a fresh session of `user`, made by Better Auth. */
export async function signInAs(
  { auth }: TestContext,
  user: Pick<TestUser, "username" | "password">,
  rememberMe = true,
): Promise<string> {
  const { headers } = await auth.api.signInUsername({
    body: { username: user.username, password: user.password, rememberMe },
    headers: new Headers({ "user-agent": "vitest" }),
    returnHeaders: true,
  });
  return cookieHeaderFrom(headers);
}

/** Turns Set-Cookie response headers into a request Cookie header. */
export function cookieHeaderFrom(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((line) => line.split(";")[0] ?? "")
    .filter((pair) => pair !== "" && !pair.endsWith("="))
    .join("; ");
}
