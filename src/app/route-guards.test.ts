// Every page and API checks access on the server (design D7). A new page or
// route without a guard fails here instead of shipping open.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const APP = join(process.cwd(), "src/app");

function filesNamed(dir: string, name: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name === name)
    .map((entry) => join(entry.parentPath, entry.name));
}

const label = (file: string) => relative(APP, file);

/** Routes that must stay open: monitoring and Better Auth's own handler. */
const OPEN_ROUTES = [
  "api/health/route.ts",
  "api/auth/[...all]/route.ts",
  "api/telemetry/errors/route.ts",
];

describe("route guards", () => {
  const desktopPages = filesNamed(join(APP, "(desktop)"), "page.tsx");
  const mobilePages = filesNamed(join(APP, "(mobile)"), "page.tsx");
  const routes = filesNamed(join(APP, "api"), "route.ts").filter(
    (file) => !OPEN_ROUTES.includes(label(file)),
  );

  it("finds the files it checks", () => {
    expect(desktopPages.length).toBeGreaterThanOrEqual(9);
    expect(mobilePages.length).toBeGreaterThanOrEqual(4);
    expect(routes.length).toBeGreaterThanOrEqual(1);
  });

  it.each(desktopPages.map((file) => [label(file), file]))(
    "%s checks a permission",
    (_name, file) => {
      expect(readFileSync(file, "utf8")).toMatch(/await requirePermission\(/);
    },
  );

  it.each(mobilePages.map((file) => [label(file), file]))(
    "%s requires a signed-in user",
    (_name, file) => {
      expect(readFileSync(file, "utf8")).toMatch(
        /await require(User|Permission)\(/,
      );
    },
  );

  it("change-password requires a signed-in user", () => {
    expect(readFileSync(join(APP, "change-password/page.tsx"), "utf8")).toMatch(
      /await requireUser\(/,
    );
  });

  it("two-factor requires a signed-in user", () => {
    expect(readFileSync(join(APP, "two-factor/page.tsx"), "utf8")).toMatch(
      /await requireUser\(/,
    );
  });

  it("sessions requires a signed-in user", () => {
    expect(readFileSync(join(APP, "sessions/page.tsx"), "utf8")).toMatch(
      /await requireUser\(/,
    );
  });

  it.each(routes.map((file) => [label(file), file]))(
    "%s wraps every handler in withAuth",
    (_name, file) => {
      const source = readFileSync(file, "utf8");
      const handlers = source.match(
        /export (const|async function) (GET|POST|PUT|PATCH|DELETE)\b/g,
      );
      const guarded = source.match(
        /export const (GET|POST|PUT|PATCH|DELETE) = withAuth(<[^>]*>)?\(/g,
      );
      expect(handlers?.length ?? 0).toBeGreaterThan(0);
      expect(guarded?.length).toBe(handlers?.length);
    },
  );

  // Contracts are checked per type and per account scope (contracts design
  // D8): every handler hands the scope to the service through contractActor.
  const contractRoutes = routes.filter((file) =>
    label(file).startsWith("api/contracts/"),
  );

  it("finds the contract routes", () => {
    expect(contractRoutes.length).toBeGreaterThanOrEqual(10);
  });

  it.each(contractRoutes.map((file) => [label(file), file]))(
    "%s passes the account scope to the service",
    (_name, file) => {
      const source = readFileSync(file, "utf8");
      const handlers = source.match(
        /export const (GET|POST|PUT|PATCH|DELETE)\b/g,
      );
      const scoped = source.match(/contractActor\(user, actor\)/g);
      expect(scoped?.length ?? 0).toBe(handlers?.length ?? -1);
    },
  );
});
