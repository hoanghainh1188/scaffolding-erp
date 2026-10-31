import { randomUUID } from "node:crypto";

import type { Database } from "@/db/client";
import { account, user } from "@/db/schema";
import type { Role } from "@/domain/role";
import { normalizeUsername, placeholderEmail } from "@/domain/username";

import type { Auth } from "./auth";

/** Better Auth's provider id for username/password accounts. */
export const CREDENTIAL_PROVIDER = "credential";

export type UserStatus = "ACTIVE" | "LOCKED";

/** A Drizzle database or an open transaction on one. */
export type Executor = Pick<
  Database,
  "insert" | "update" | "delete" | "select" | "execute"
>;

/** Hashes with Better Auth's own algorithm (scrypt), the one sign-in checks. */
export async function hashPassword(
  auth: Auth,
  password: string,
): Promise<string> {
  const context = await auth.$context;
  return context.password.hash(password);
}

export async function verifyPassword(
  auth: Auth,
  hash: string,
  password: string,
): Promise<boolean> {
  const context = await auth.$context;
  return context.password.verify({ hash, password });
}

export interface NewUser {
  name: string;
  username: string;
  role: Role;
  /** Plain password; only its hash is stored. */
  password: string;
  mustChangePassword: boolean;
  tempPasswordExpiresAt?: Date | null;
  status?: UserStatus;
}

/**
 * Inserts a user and its password account. Run inside the caller's
 * transaction so both rows land together.
 */
export async function insertUser(
  tx: Executor,
  auth: Auth,
  input: NewUser,
): Promise<string> {
  const id = randomUUID();
  const username = normalizeUsername(input.username);
  const passwordHash = await hashPassword(auth, input.password);
  await tx.insert(user).values({
    id,
    name: input.name,
    email: placeholderEmail(username),
    username,
    displayUsername: username,
    role: input.role,
    status: input.status ?? "ACTIVE",
    mustChangePassword: input.mustChangePassword,
    tempPasswordExpiresAt: input.tempPasswordExpiresAt,
  });
  await tx.insert(account).values({
    id: randomUUID(),
    accountId: id,
    providerId: CREDENTIAL_PROVIDER,
    userId: id,
    password: passwordHash,
  });
  return id;
}
