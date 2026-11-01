// Applies the SQL migrations in ./drizzle to DATABASE_URL_UNPOOLED or DATABASE_URL.
// Run with `npm run db:migrate` (Node strips the types; no build step).
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export function resolveMigrationUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Neither DATABASE_URL_UNPOOLED nor DATABASE_URL is set. Copy .env.example to .env.",
    );
  }
  return url;
}

export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, {
    max: 1,
    connection: { TimeZone: "UTC" },
    onnotice: () => {},
  });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    process.stdout.write("Migrations applied.\n");
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations(resolveMigrationUrl(process.env)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Migration failed: ${message}\n`);
    process.exit(1);
  });
}
