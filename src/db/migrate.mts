// Applies the SQL migrations in ./drizzle as the table owner
// (DATABASE_URL_MIGRATE), then grants the app role its least privileges
// (db-least-privilege D2). Run with `npm run db:migrate` (Node strips the
// types; no build step).
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import {
  applyGrants,
  findPrivilegeProblems,
  GrantError,
  resolveAppRole,
} from "./grants.ts";

/** The owner URL. Never falls back to DATABASE_URL (the app role). */
export function resolveMigrationUrl(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const url = env.DATABASE_URL_MIGRATE?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL_MIGRATE is not set: migrations run as the table owner, not the app role in DATABASE_URL. Copy .env.example to .env.",
    );
  }
  return url;
}

export async function runMigrations(
  url: string,
  appRole: string,
): Promise<void> {
  const client = postgres(url, {
    max: 1,
    connection: { TimeZone: "UTC" },
    onnotice: () => {},
  });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    process.stdout.write("Migrations applied.\n");
    await applyGrants(client, appRole);
    const problems = await findPrivilegeProblems(client, appRole);
    if (problems.length > 0) {
      throw new GrantError(
        `Quyền của role "${appRole}" sai:\n${problems.map((p) => `- ${p}`).join("\n")}`,
      );
    }
    process.stdout.write(`Grants applied to ${appRole}.\n`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  Promise.resolve()
    .then(() =>
      runMigrations(
        resolveMigrationUrl(process.env),
        resolveAppRole(process.env),
      ),
    )
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Migration failed: ${message}\n`);
      process.exit(1);
    });
}
