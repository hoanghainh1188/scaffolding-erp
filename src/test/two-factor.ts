// Helpers for integration tests of the second factor (director-mfa).
import { createHmac } from "node:crypto";

import type { TestContext, TestUser } from "./auth";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(text: string): Buffer {
  let bits = "";
  for (const char of text.replace(/=+$/, "").toUpperCase()) {
    bits += BASE32.indexOf(char).toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
}

/** The code an authenticator app shows for a base32 secret. */
export function totpCode(
  secret: string,
  time: number = Date.now(),
  stepOffset = 0,
): string {
  const step = BigInt(Math.floor(time / 30_000) + stepOffset);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(step);
  const hash = createHmac("sha1", decodeBase32(secret))
    .update(counter)
    .digest();
  const offset = (hash[hash.length - 1] ?? 0) & 0xf;
  const value = hash.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, "0");
}

export const secretOf = (totpUri: string): string =>
  new URLSearchParams(totpUri.split("?")[1] ?? "").get("secret") ?? "";

/** `name=value; ...` from Set-Cookie lines, dropping cleared cookies. */
export function cookiesOf(setCookies: readonly string[]): string {
  return setCookies
    .map((line) => line.split(";")[0] ?? "")
    .filter((pair) => pair !== "" && !pair.endsWith("="))
    .join("; ");
}

/** A session straight from Better Auth, without the test flag of signInAs. */
export async function plainSession(
  { auth }: Pick<TestContext, "auth">,
  who: Pick<TestUser, "username" | "password">,
  rememberMe = true,
): Promise<string> {
  const { headers } = await auth.api.signInUsername({
    body: { username: who.username, password: who.password, rememberMe },
    headers: new Headers({ "user-agent": "vitest" }),
    returnHeaders: true,
  });
  return cookiesOf(headers.getSetCookie());
}

export interface Enrolled {
  secret: string;
  backupCodes: string[];
  /** The session that turned it on. */
  cookie: string;
}

/** Turns the second factor on through the plugin, as the setup screen does. */
export async function enroll(
  ctx: Pick<TestContext, "auth">,
  who: Pick<TestUser, "username" | "password">,
): Promise<Enrolled> {
  const cookie = await plainSession(ctx, who);
  const headers = new Headers({ cookie, "user-agent": "vitest" });
  const started = await ctx.auth.api.enableTwoFactor({
    body: { password: who.password },
    headers,
  });
  if (started.method !== "totp") throw new Error("expected a TOTP setup");
  const secret = secretOf(started.totpURI);
  const done = await ctx.auth.api.verifyTOTP({
    body: { code: totpCode(secret) },
    headers,
    returnHeaders: true,
  });
  return {
    secret,
    backupCodes: started.backupCodes,
    cookie: cookiesOf(done.headers.getSetCookie()),
  };
}
