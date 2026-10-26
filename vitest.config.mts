import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig, type TestProjectConfiguration } from "vitest/config";

// Vitest does not put .env values on process.env by itself; read them here so
// TEST_DATABASE_URL from .env / .env.local reaches the integration project.
const env = { ...loadEnv("test", process.cwd(), ""), ...process.env };
const isCI = env.CI === "true";
const hasTestDatabase = Boolean(env.TEST_DATABASE_URL);

if (!hasTestDatabase && isCI) {
  throw new Error("TEST_DATABASE_URL is required on CI for integration tests.");
}
if (!hasTestDatabase) {
  console.warn(
    "[vitest] TEST_DATABASE_URL is not set: skipping the integration project. Run `npm run db:up` and copy .env.example to .env.",
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
    env: { TEST_DATABASE_URL: env.TEST_DATABASE_URL ?? "" },
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
