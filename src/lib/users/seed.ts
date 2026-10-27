import { and, eq, inArray } from "drizzle-orm";

import { account, loginThrottle, user } from "@/db/schema";
import type { Role } from "@/domain/role";
import {
  CREDENTIAL_PROVIDER,
  hashPassword,
  insertUser,
} from "@/lib/auth/credentials";

import type { UserServiceDeps } from "./service";

export interface SeedAccount {
  username: string;
  name: string;
  role: Role;
}

/** `npm run db:seed:dev`: one account per role (design D8). */
export const DEV_ACCOUNTS: readonly SeedAccount[] = [
  { username: "giamdoc", name: "Minh Anh", role: "DIRECTOR" },
  { username: "ketoan", name: "Thu Hà", role: "ACCOUNTANT" },
  { username: "kinhdoanh", name: "Quốc Bảo", role: "SALES" },
  { username: "thukho", name: "Văn Tùng", role: "WAREHOUSE" },
  { username: "xuong", name: "Hoàng Nam", role: "WORKSHOP" },
];

export interface SeedOptions {
  password: string;
  /**
   * Also put existing accounts back to a known state: this password, active,
   * no pending change. E2E runs need that; the dev seed leaves them alone.
   */
  reset?: boolean;
}

/** Creates missing accounts; returns the usernames it created. */
export async function seedAccounts(
  { db, auth }: UserServiceDeps,
  accounts: readonly SeedAccount[],
  { password, reset = false }: SeedOptions,
): Promise<string[]> {
  const hash = await hashPassword(auth, password);
  return db.transaction(async (tx) => {
    const usernames = accounts.map((entry) => entry.username);
    const existing = await tx
      .select({ id: user.id, username: user.username })
      .from(user)
      .where(inArray(user.username, usernames));
    const known = new Set(existing.map((row) => row.username));

    const created: string[] = [];
    for (const entry of accounts) {
      if (known.has(entry.username)) continue;
      await insertUser(tx, auth, {
        ...entry,
        password,
        mustChangePassword: false,
      });
      created.push(entry.username);
    }

    if (reset) {
      for (const row of existing) {
        const entry = accounts.find((item) => item.username === row.username);
        await tx
          .update(user)
          .set({
            role: entry?.role,
            status: "ACTIVE",
            mustChangePassword: false,
            updatedAt: new Date(),
          })
          .where(eq(user.id, row.id));
        await tx
          .update(account)
          .set({ password: hash, updatedAt: new Date() })
          .where(
            and(
              eq(account.userId, row.id),
              eq(account.providerId, CREDENTIAL_PROVIDER),
            ),
          );
      }
      await tx
        .delete(loginThrottle)
        .where(inArray(loginThrottle.usernameKey, usernames));
    }
    return created;
  });
}
