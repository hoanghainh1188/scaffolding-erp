// Integration-test helpers for real sign-in against TEST_DATABASE_URL.
import { and, eq, inArray, sql } from "drizzle-orm";

import { createDatabase, type DatabaseHandle } from "@/db/client";
import { user } from "@/db/schema";
import { PERMISSIONS } from "@/domain/permissions";
import type { Role } from "@/domain/role";
import { createAuth, type Auth } from "@/lib/auth/auth";
import { insertUser, type UserStatus } from "@/lib/auth/credentials";

import { systemActor, type ActivityActor } from "@/lib/activity/actor";

import { truncateWithLedger } from "./inventory";

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
export async function resetAuthTables(): Promise<void> {
  // CASCADE reaches the inventory ledger (created_by), which only a test may
  // empty.
  await truncateWithLedger(
    sql`truncate table "activity_log", "user", "session", "account", "verification", "rate_limit", "login_throttle", "auth_rate_limit" cascade`,
  );
}

export interface TestUserOptions {
  role: Role;
  username?: string;
  name?: string;
  status?: UserStatus;
  mustChangePassword?: boolean;
  tempPasswordExpiresAt?: Date | null;
  password?: string;
}

/** Also an activity-log actor: a computer with an unknown browser. */
export interface TestUser extends ActivityActor {
  username: string;
  password: string;
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
    tempPasswordExpiresAt: options.tempPasswordExpiresAt,
  });
  return {
    ...systemActor({ id, role: options.role }),
    username,
    password,
  };
}

/** Cookie header for a fresh session of `user`, made by Better Auth. */
export async function signInAs(
  { db, auth }: TestContext,
  account: Pick<TestUser, "username" | "password">,
  rememberMe = true,
): Promise<string> {
  // Off for the sign-in, on after: the session passes the D1 gate of
  // director-mfa without every route test entering a code (design D9).
  const setFlag = (on: boolean) =>
    db
      .update(user)
      .set({ twoFactorEnabled: on })
      .where(
        and(
          eq(user.username, account.username),
          inArray(user.role, [...PERMISSIONS["twoFactor.manage"]]),
        ),
      );
  await setFlag(false);
  const { headers } = await auth.api.signInUsername({
    body: {
      username: account.username,
      password: account.password,
      rememberMe,
    },
    headers: new Headers({ "user-agent": "vitest" }),
    returnHeaders: true,
  });
  await setFlag(true);
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
