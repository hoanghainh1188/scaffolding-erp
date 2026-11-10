import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig, type TestProjectConfiguration } from "vitest/config";

// Vitest does not put .env values on process.env by itself; read them here so
// the test database URLs from .env / .env.local reach the integration project.
// Code under test connects as the app role, table resets as the owner
// (db-least-privilege D5).
const env = { ...loadEnv("test", process.cwd(), ""), ...process.env };
const isCI = env.CI === "true";
const DATABASE_VARIABLES = ["TEST_DATABASE_URL", "TEST_DATABASE_URL_MIGRATE"];
const missing = DATABASE_VARIABLES.filter((name) => !env[name]);
const hasTestDatabase = missing.length === 0;

if (!hasTestDatabase && isCI) {
  throw new Error(
    `${missing.join(" and ")} required on CI for integration tests.`,
  );
}
if (!hasTestDatabase) {
  console.warn(
    `[vitest] ${missing.join(" and ")} not set: skipping the integration project. Run \`npm run db:up\` and copy .env.example to .env.`,
  );
}

const unit: TestProjectConfiguration = {
  extends: true,
  test: {
    name: "unit",
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["src/**/*.int.test.ts"],
  },
};

const component: TestProjectConfiguration = {
  extends: true,
  test: {
    name: "component",
    environment: "jsdom",
    include: ["src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup-component.ts"],
  },
};

const integration: TestProjectConfiguration = {
  extends: true,
  test: {
    name: "integration",
    environment: "node",
    include: ["src/**/*.int.test.ts"],
    env: {
      TEST_DATABASE_URL: env.TEST_DATABASE_URL ?? "",
      TEST_DATABASE_URL_MIGRATE: env.TEST_DATABASE_URL_MIGRATE ?? "",
      // Fake key, same on every machine (personal-data-protection D2).
      PII_ENCRYPTION_KEYS: `1:${Buffer.alloc(32, 7).toString("base64")}`,
    },
    setupFiles: ["./src/test/setup-integration.ts"],
    // Tests share one database; run files one at a time.
    fileParallelism: false,
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    projects: hasTestDatabase
      ? [unit, component, integration]
      : [unit, component],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**"],
      thresholds: {
        "src/domain/**": {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
        "src/lib/**": {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
      },
    },
  },
});
