import { expect, test } from "@playwright/test";

import { SIGNED_OUT } from "./auth-helpers";
import { runOnlyIn } from "./helpers";

test.describe("security headers and CSP", () => {
  test.use({ storageState: SIGNED_OUT });

  test("serves CSP and security headers on /login", async ({
    page,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop flow");

    const response = await page.goto("/login");
    expect(response?.status()).toBe(200);

    const headers = response?.headers() ?? {};
    const csp = headers["content-security-policy"];

    expect(csp).toBeDefined();
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");

    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("blocks inline script without nonce", async ({ page }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop flow");

    await page.goto("/login");

    const violation = await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        document.addEventListener(
          "securitypolicyviolation",
          (e) => {
            resolve(e.violatedDirective);
          },
          { once: true },
        );

        // Attempt inline event handler XSS
        const img = document.createElement("img");
        img.src = "invalid-src.jpg";
        img.setAttribute("onerror", "window.__xss_probe = true");
        document.body.appendChild(img);

        setTimeout(() => resolve("not-fired"), 1500);
      });
    });

    expect(violation).toContain("script-src");

    const probe = await page.evaluate(
      () => (window as unknown as { __xss_probe?: boolean }).__xss_probe,
    );
    expect(probe).toBeUndefined();
  });

  test("serves PWA webmanifest without error", async ({ page }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop flow");

    const res = await page.request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);

    const json = await res.json();
    expect(json.name).toBe("Scaffolding ERP");
    expect(json.start_url).toBe("/m");
  });
});
