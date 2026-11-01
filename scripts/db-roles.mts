// Creates the local app role erp_app (db-least-privilege D4) on the database
// server behind DATABASE_URL_MIGRATE. Local Docker and CI only: the role gets
// a known password, so any other host is refused (Neon: create it with SQL).
//   npm run db:roles
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

// "postgres" is the service name of the CI database container.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "postgres"]);

/** Whether a connection URL points at a local or CI database server. */
export function isLocalDatabase(url: string): boolean {
  if (!URL.canParse(url)) return false;
  return LOCAL_HOSTS.has(new URL(url).hostname);
}

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL_MIGRATE;
  if (!url) {
    process.stderr.write(
      "Thiếu DATABASE_URL_MIGRATE (role owner) trong .env (xem .env.example).\n",
    );
    return 1;
  }
  if (!isLocalDatabase(url)) {
    process.stderr.write(
      "db:roles chỉ chạy với Postgres local hoặc CI. Trên Neon tạo role app bằng SQL (docs/ops/demo.md).\n",
    );
    return 1;
  }
  const script = readFileSync(
    fileURLToPath(new URL("../docker/postgres/roles.sql", import.meta.url)),
    "utf8",
  );
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client.unsafe(script);
    process.stdout.write("Role erp_app đã có.\n");
    return 0;
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Tạo role thất bại: ${message}\n`);
      process.exit(1);
    },
  );
}
