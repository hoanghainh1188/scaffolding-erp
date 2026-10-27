// Before any E2E test: put the e2e.* accounts in a known state and remove
// the throwaway accounts earlier runs created. Uses the same database as the
// dev server (DATABASE_URL).
import { like } from "drizzle-orm";

import { createDatabase } from "@/db/client";
import { user } from "@/db/schema";
import { createAuth } from "@/lib/auth/auth";
import { getEnv } from "@/lib/env";
import { E2E_ACCOUNTS, E2E_TEMP_PREFIX } from "@/lib/users/e2e-accounts";
import { seedAccounts } from "@/lib/users/seed";

export default async function globalSetup(): Promise<void> {
  const env = getEnv();
  if (!env.E2E_PASSWORD) {
    throw new Error("E2E_PASSWORD is not set (see .env.example).");
  }
  const handle = createDatabase(env.DATABASE_URL);
  try {
    const auth = createAuth({
      db: handle.db,
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
    });
    // Test-only rows: sessions and accounts go with them (ON DELETE CASCADE).
    await handle.db
      .delete(user)
      .where(like(user.username, `${E2E_TEMP_PREFIX}%`));
    await seedAccounts({ db: handle.db, auth }, E2E_ACCOUNTS, {
      password: env.E2E_PASSWORD,
      reset: true,
    });
  } finally {
    await handle.close();
  }
}
