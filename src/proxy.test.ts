import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

describe("proxy security headers", () => {
  it("injects Content-Security-Policy with nonce for HTML page requests", async () => {
    const request = new NextRequest("http://localhost:3000/login");
    const response = await proxy(request);

    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
    expect(csp).toContain("strict-dynamic");
    expect(csp).toContain("object-src 'none'");
  });

  it("generates different nonces for subsequent requests", async () => {
    const req1 = new NextRequest("http://localhost:3000/login");
    const req2 = new NextRequest("http://localhost:3000/login");

    const res1 = await proxy(req1);
    const res2 = await proxy(req2);

    const csp1 = res1.headers.get("Content-Security-Policy");
    const csp2 = res2.headers.get("Content-Security-Policy");

    expect(csp1).toBeTruthy();
    expect(csp2).toBeTruthy();
    expect(csp1).not.toBe(csp2);
  });

  it("does not attach CSP nonce header to API routes", async () => {
    const request = new NextRequest("http://localhost:3000/api/health");
    const response = await proxy(request);

    expect(response.headers.get("Content-Security-Policy")).toBeNull();
  });
});
