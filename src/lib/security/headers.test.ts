import { describe, expect, it } from "vitest";

import nextConfig, { securityHeaders } from "../../../next.config";

describe("securityHeaders in next.config.ts", () => {
  it("contains all 4 static security headers", async () => {
    expect(securityHeaders).toHaveLength(4);

    const headers = await nextConfig.headers?.();
    const globalHeaderRule = headers?.find((rule) => rule.source === "/:path*");

    expect(globalHeaderRule).toBeDefined();
    const map = new Map(globalHeaderRule?.headers.map((h) => [h.key, h.value]));

    expect(map.get("X-Frame-Options")).toBe("DENY");
    expect(map.get("X-Content-Type-Options")).toBe("nosniff");
    expect(map.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(map.get("Permissions-Policy")).toBe("camera=(self), microphone=(), geolocation=()");
  });
});
