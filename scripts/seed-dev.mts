// Sample accounts for local development, one per role, all with the
// password in DEV_SEED_PASSWORD. Safe to run again. Never in production.
//   npm run db:seed:dev
import { createDatabase } from "@/db/client";
import { createAuth } from "@/lib/auth/auth";
import { getEnv } from "@/lib/env";
import { DEV_ACCOUNTS, seedAccounts } from "@/lib/users/seed";

async function main(): Promise<number> {
  // Checked before anything else reads the configuration.
  if (process.env.NODE_ENV === "production") {
    process.stderr.write("db:seed:dev không chạy ở production.\n");
    return 1;
  }
  const env = getEnv();
  if (!env.DEV_SEED_PASSWORD) {
    process.stderr.write(
      "Thiếu DEV_SEED_PASSWORD trong .env (xem .env.example).\n",
    );
    return 1;
  }
  const handle = createDatabase(env.DATABASE_URL);
  try {
    const auth = createAuth({
      db: handle.db,
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
    });
    const created = await seedAccounts({ db: handle.db, auth }, DEV_ACCOUNTS, {
      password: env.DEV_SEED_PASSWORD,
    });
    const names = DEV_ACCOUNTS.map((entry) => entry.username).join(", ");
    process.stdout.write(
      created.length > 0
        ? `Đã tạo ${created.length} tài khoản: ${created.join(", ")}.\n`
        : `Đã có đủ tài khoản mẫu: ${names}.\n`,
    );
    return 0;
  } finally {
    await handle.close();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Seed thất bại: ${message}\n`);
    process.exit(1);
  },
);
