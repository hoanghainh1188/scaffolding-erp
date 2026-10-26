import { defineConfig, devices } from "@playwright/test";

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
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}",
  grepInvert,
  use: {
    baseURL,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop-1280",
      use: {
        ...devices["Desktop Edge"],
        ...edge,
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "desktop-1366",
      use: {
        ...devices["Desktop Edge"],
        ...edge,
        viewport: { width: 1366, height: 768 },
      },
    },
    {
      name: "mobile-375",
      use: {
        ...devices["Desktop Edge"],
        ...edge,
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    // Safari and Firefox have basic support: only @basic tests run there.
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, grep: /@basic/ },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, grep: /@basic/ },
  ],
  webServer: {
    command: isCI
      ? `npm run build && npm run start -- -p ${port}`
      : `npm run dev -- -p ${port}`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
});
