import { and, eq, sql } from "drizzle-orm";

import { user } from "@/db/schema";
import { generateTempPassword } from "@/domain/temp-password";
import { insertUser } from "@/lib/auth/credentials";

import {
  createUserSchema,
  type ServiceResult,
  type UserServiceDeps,
} from "./service";

export const FIRST_DIRECTOR_MESSAGES = {
  exists: "Đã có tài khoản Giám đốc. Dùng màn Người dùng để thêm tài khoản",
  usernameTaken: "Tên đăng nhập đã có người dùng",
} as const;

/**
 * Creates the first Giám đốc on a fresh install (design D4). Refuses when an
 * active director exists; the advisory lock stops two runs racing.
 */
export async function createFirstDirector(
  { db, auth }: UserServiceDeps,
  input: { name: string; username: string },
): Promise<ServiceResult<{ username: string; tempPassword: string }>> {
  const parsed = createUserSchema.safeParse({ ...input, role: "DIRECTOR" });
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const tempPassword = generateTempPassword();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('create-director'))`,
    );
    const [director] = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.role, "DIRECTOR"), eq(user.status, "ACTIVE")));
    if (director) {
      return {
        ok: false as const,
        status: 409 as const,
        error: FIRST_DIRECTOR_MESSAGES.exists,
      };
    }
    const [taken] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.username, parsed.data.username));
    if (taken) {
      return {
        ok: false as const,
        status: 409 as const,
        error: FIRST_DIRECTOR_MESSAGES.usernameTaken,
      };
    }
    await insertUser(tx, auth, {
      ...parsed.data,
      password: tempPassword,
      mustChangePassword: true,
      tempPasswordExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });
    return {
      ok: true as const,
      data: { username: parsed.data.username, tempPassword },
    };
  });
}
