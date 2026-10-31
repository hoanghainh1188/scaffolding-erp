import type { NextConfig } from "next";

// Applied to every response. Content-Security-Policy (CSP) with a per-request
// nonce is handled dynamically in src/proxy.ts.
export const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera stays allowed for this origin: QR scanning and damage photos later.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // Playwright runs on `next dev` (design D15); hide the dev indicator there.
  devIndicators: process.env.E2E === "1" ? false : undefined,
  cacheComponents: true,
  experimental: {
    // forbidden() renders src/app/forbidden.tsx for a role without access.
    authInterrupts: true,
    // Every screen waits for the session check (auth-and-roles design D7),
    // so none can be an instant navigation. Validate only segments that
    // opt in with `export const instant = true`.
    instantInsights: { validationLevel: "manual-warning" },
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // "/" has no page of its own; the office dashboard is home (design D3).
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
