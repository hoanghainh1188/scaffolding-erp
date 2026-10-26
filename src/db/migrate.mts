// Applies the SQL migrations in ./drizzle to DATABASE_URL.
// Run with `npm run db:migrate` (Node strips the types; no build step).
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  }
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

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Migration failed: ${message}\n`);
  process.exit(1);
});
