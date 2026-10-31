import { describe, expect, it } from "vitest";

import { buildCspHeader, generateNonce } from "./csp";

describe("generateNonce", () => {
  it("generates a non-empty base64 string", () => {
    const nonce1 = generateNonce();
    const nonce2 = generateNonce();

    expect(nonce1).toBeTypeOf("string");
    expect(nonce1.length).toBeGreaterThan(16);
    expect(nonce1).not.toBe(nonce2);

    // Should be valid base64
    expect(() => Buffer.from(nonce1, "base64")).not.toThrow();
  });
});

describe("buildCspHeader", () => {
  it("builds production CSP with nonce, strict-dynamic and security directives", () => {
    const nonce = "test-random-nonce-123";
    const csp = buildCspHeader({ nonce, isDev: false });

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain(
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    );
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' blob: data:");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("includes unsafe-eval in development mode for React debugging", () => {
    const nonce = "dev-nonce-456";
    const csp = buildCspHeader({ nonce, isDev: true });

    expect(csp).toContain(
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`,
    );
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
