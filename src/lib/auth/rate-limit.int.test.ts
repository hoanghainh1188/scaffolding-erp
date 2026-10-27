import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createTestContext, resetAuthTables } from "@/test/auth";

import { clientIp, consumeSignInAttempt } from "./rate-limit";

const ctx = createTestContext();

afterAll(ctx.close);
beforeEach(() => resetAuthTables(ctx));

const at = (seconds: number) => new Date(Date.UTC(2026, 10, 2, 1, 0, seconds));

async function attempts(ip: string, count: number, now: Date) {
  const results: boolean[] = [];
  for (let i = 0; i < count; i += 1) {
    results.push(await consumeSignInAttempt(ctx.db, ip, now));
  }
  return results;
}

describe("sign-in rate limit per IP", () => {
  it("allows 20 attempts a minute and blocks the 21st", async () => {
    const results = await attempts("203.0.113.7", 21, at(10));
    expect(results.slice(0, 20).every(Boolean)).toBe(true);
    expect(results[20]).toBe(false);
  });

  it("allows again in the next window", async () => {
    await attempts("203.0.113.7", 21, at(0));
    expect(await consumeSignInAttempt(ctx.db, "203.0.113.7", at(61))).toBe(
      true,
    );
  });

  it("keeps addresses apart", async () => {
    await attempts("203.0.113.7", 21, at(0));
    expect(await consumeSignInAttempt(ctx.db, "203.0.113.8", at(1))).toBe(true);
  });

  it("does not lose counts under concurrent attempts", async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () =>
        consumeSignInAttempt(ctx.db, "203.0.113.9", at(5)),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(20);
  });
});

describe("clientIp", () => {
  it("takes the last X-Forwarded-For entry", () => {
    expect(
      clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" })),
    ).toBe("203.0.113.7");
  });

  it("falls back when the header is missing", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
