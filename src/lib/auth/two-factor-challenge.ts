// Ties the plugin's two_factor cookie to who is signing in (director-mfa
// design D2). A failed code does not tell who it was for, and counting
// failures needs the login name, so it is kept here, on the server, and
// never read from the client.
import { createHash, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { verification } from "@/db/schema";
import { TWO_FACTOR_CHALLENGE_SECONDS } from "@/domain/two-factor";

import type { Auth } from "./auth";

export interface Challenge {
  userId: string;
  usernameKey: string;
  remember: boolean;
}

const COOKIE_NAME = "two_factor";

async function cookieName(auth: Auth): Promise<string> {
  return (await auth.$context).createAuthCookie(COOKIE_NAME).name;
}

const identifierOf = (cookie: string): string =>
  `erp-2fa:${createHash("sha256").update(decodeURIComponent(cookie)).digest("hex")}`;

export async function saveChallenge(
  db: Database,
  auth: Auth,
  setCookies: readonly string[],
  challenge: Challenge,
): Promise<void> {
  const prefix = `${await cookieName(auth)}=`;
  const line = setCookies.find((entry) => entry.startsWith(prefix));
  if (!line) throw new Error("two-factor challenge cookie is missing");
  const cookie = line.slice(prefix.length).split(";")[0] ?? "";
  await db.insert(verification).values({
    id: randomUUID(),
    identifier: identifierOf(cookie),
    value: JSON.stringify(challenge),
    expiresAt: new Date(Date.now() + TWO_FACTOR_CHALLENGE_SECONDS * 1000),
  });
}

function requestCookie(headers: Headers, name: string): string | null {
  for (const pair of (headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export interface LoadedChallenge extends Challenge {
  /** The row's key, to delete once the sign-in is done. */
  identifier: string;
}

/** The challenge of this browser, or null when absent or expired. */
export async function loadChallenge(
  db: Database,
  auth: Auth,
  headers: Headers,
  now: Date,
): Promise<LoadedChallenge | null> {
  const cookie = requestCookie(headers, await cookieName(auth));
  if (!cookie) return null;
  const identifier = identifierOf(cookie);
  const [row] = await db
    .select()
    .from(verification)
    .where(eq(verification.identifier, identifier));
  if (!row || row.expiresAt.getTime() <= now.getTime()) return null;
  return { ...(JSON.parse(row.value) as Challenge), identifier };
}

export async function dropChallenge(
  db: Database,
  identifier: string,
): Promise<void> {
  await db.delete(verification).where(eq(verification.identifier, identifier));
}
