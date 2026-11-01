import { describe, expect, it } from "vitest";

import nextConfig, {
  buildSecurityHeaders,
  securityHeaders,
} from "../../../next.config";

const HSTS = "Strict-Transport-Security";

describe("securityHeaders in next.config.ts", () => {
  it("contains the 4 static security headers plus HSTS outside dev", async () => {
    expect(securityHeaders).toHaveLength(5);

    const headers = await nextConfig.headers?.();
    const globalHeaderRule = headers?.find((rule) => rule.source === "/:path*");

    expect(globalHeaderRule).toBeDefined();
    const map = new Map(globalHeaderRule?.headers.map((h) => [h.key, h.value]));

    expect(map.get("X-Frame-Options")).toBe("DENY");
    expect(map.get("X-Content-Type-Options")).toBe("nosniff");
    expect(map.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(map.get("Permissions-Policy")).toBe(
      "camera=(self), microphone=(), geolocation=()",
    );
    expect(map.get(HSTS)).toBe("max-age=31536000; includeSubDomains");
  });

  it("leaves HSTS out in dev so localhost is never pinned to https", () => {
    const dev = buildSecurityHeaders(true);

    expect(dev).toHaveLength(4);
    expect(dev.some((h) => h.key === HSTS)).toBe(false);
  });
});
