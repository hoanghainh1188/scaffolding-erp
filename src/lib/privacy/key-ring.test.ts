import { afterEach, describe, expect, it, vi } from "vitest";

import { PiiCipherError } from "./cipher";
import { getPiiKeyRing } from "./key-ring";

const key = (fill: number) => Buffer.alloc(32, fill).toString("base64");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getPiiKeyRing", () => {
  it("encrypts with the first key and decrypts with all", () => {
    vi.stubEnv("PII_ENCRYPTION_KEYS", `2:${key(2)},1:${key(1)}`);
    const ring = getPiiKeyRing();
    expect(ring.current.id).toBe(2);
    expect(ring.all.map((entry) => entry.id)).toEqual([2, 1]);
  });

  it("names the variable when it is missing", () => {
    vi.stubEnv("PII_ENCRYPTION_KEYS", "");
    expect(getPiiKeyRing).toThrow(PiiCipherError);
    expect(getPiiKeyRing).toThrow("PII_ENCRYPTION_KEYS");
  });

  it("does not repeat a malformed value", () => {
    vi.stubEnv("PII_ENCRYPTION_KEYS", "1:not-a-key");
    expect(getPiiKeyRing).toThrow(/sai dạng/);
    expect(getPiiKeyRing).not.toThrow(/not-a-key/);
  });
});
