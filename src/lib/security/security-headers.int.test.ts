import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";
import { proxy } from "../../proxy";

describe("security-headers integration", () => {
  it("generates independent nonces for consecutive page requests", async () => {
    const req1 = new NextRequest("http://localhost:3000/login");
    const req2 = new NextRequest("http://localhost:3000/login");

    const res1 = await proxy(req1);
    const res2 = await proxy(req2);

    const csp1 = res1.headers.get("Content-Security-Policy");
    const csp2 = res2.headers.get("Content-Security-Policy");

    expect(csp1).toBeTruthy();
    expect(csp2).toBeTruthy();
    expect(csp1).not.toBe(csp2);

    expect(csp1).toContain("'strict-dynamic'");
    expect(csp1).toContain("object-src 'none'");
    expect(csp2).toContain("'strict-dynamic'");
    expect(csp2).toContain("object-src 'none'");
  });

  it("leaves API and webmanifest requests without page nonce CSP", async () => {
    const reqApi = new NextRequest("http://localhost:3000/api/health");
    const resApi = await proxy(reqApi);
    expect(resApi.headers.get("Content-Security-Policy")).toBeNull();

    const reqManifest = new NextRequest("http://localhost:3000/manifest.webmanifest");
    const resManifest = await proxy(reqManifest);
    expect(resManifest.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("retains all 4 static security headers in next.config.ts", async () => {
    const headers = await nextConfig.headers?.();
    const globalRule = headers?.find((r) => r.source === "/:path*");
    expect(globalRule).toBeDefined();

    const map = new Map(globalRule?.headers.map((h) => [h.key, h.value]));
    expect(map.get("X-Frame-Options")).toBe("DENY");
    expect(map.get("X-Content-Type-Options")).toBe("nosniff");
    expect(map.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(map.get("Permissions-Policy")).toBe("camera=(self), microphone=(), geolocation=()");
  });
});
