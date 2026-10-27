import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

// Local runs read DATABASE_URL, BETTER_AUTH_SECRET and E2E_PASSWORD from
// .env, like the dev server; CI sets them in the workflow.
if (existsSync(".env")) process.loadEnvFile(".env");

const isCI = Boolean(process.env.CI);
const port = Number(process.env.PW_PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

// Primary browser is Microsoft Edge. Set PW_CHANNEL=chromium on a machine
// without Edge installed (same engine, small differences).
const channel = process.env.PW_CHANNEL ?? "msedge";
const edge = channel === "chromium" ? {} : { channel };

// Visual baselines are only created and compared on CI (Linux + Edge).
const grepInvert = isCI ? undefined : /@visual/;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  // Screenshots are platform-agnostic: only CI (Linux) ever writes or reads them.
  // Seeds the e2e.* accounts; the "setup" project then signs each one in.
  globalSetup: "./tests/e2e/global-setup.ts",
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}",
  grepInvert,
  // The first visit to a page compiles it on `next dev`.
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    // Signed in as Giám đốc unless a test picks another role.
    storageState: "tests/e2e/.auth/DIRECTOR.json",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Edge"],
        ...edge,
        storageState: { cookies: [], origins: [] },
      },
    },
    {
      name: "desktop-1280",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Edge"],
        ...edge,
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "desktop-1366",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Edge"],
        ...edge,
        viewport: { width: 1366, height: 768 },
      },
    },
    {
      name: "mobile-375",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Edge"],
        ...edge,
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    // Safari and Firefox have basic support: only @basic tests run there.
    {
      name: "firefox",
      dependencies: ["setup"],
      use: { ...devices["Desktop Firefox"] },
      grep: /@basic/,
    },
    {
      name: "webkit",
      dependencies: ["setup"],
      use: { ...devices["Desktop Safari"] },
      grep: /@basic/,
    },
  ],
  // Always `next dev` (setup-project design D15; moving to a production
  // build is its own change). E2E=1 hides Next's dev indicator so it never
  // covers the page or appears in screenshots.
  webServer: {
    command: `npm run dev -- -p ${port}`,
    // Every test browser signs in from localhost: lift the per-IP limit.
    env: {
      E2E: "1",
      BETTER_AUTH_URL: baseURL,
      AUTH_SIGN_IN_LIMIT_PER_MINUTE: "1000",
    },
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
});
