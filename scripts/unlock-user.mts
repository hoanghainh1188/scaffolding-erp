// Emergency unlock script for locked-out accounts.
//   npm run auth:unlock -- --username giamdoc
// Or unlock all:
//   npm run auth:unlock -- --all
import { parseArgs } from "node:util";
import { eq, inArray } from "drizzle-orm";

import { createDatabase } from "@/db/client";
import { loginThrottle, twoFactor, user } from "@/db/schema";
import { normalizeUsername } from "@/domain/username";

/** The lock on wrong second-factor codes, kept per account. */
const NOT_LOCKED = { failedVerificationCount: 0, lockedUntil: null };

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      username: { type: "string" },
      all: { type: "boolean", default: false },
    },
  });

  if (!values.all && !values.username) {
    process.stderr.write(
      "Cách dùng:\n  npm run auth:unlock -- --username <tên-đăng-nhập>\n  npm run auth:unlock -- --all\n",
    );
    return 2;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    process.stderr.write(
      "Lỗi gỡ khóa: Biến môi trường DATABASE_URL chưa được thiết lập.\n",
    );
    return 1;
  }

  const handle = createDatabase(databaseUrl);

  try {
    if (values.all) {
      const deleted = await handle.db.delete(loginThrottle).returning();
      await handle.db.update(twoFactor).set(NOT_LOCKED);
      process.stdout.write(
        `Đã gỡ tạm khóa toàn bộ hệ thống (${deleted.length} bản ghi).\n`,
      );
      return 0;
    }

    const usernameKey = normalizeUsername(values.username!);
    const deleted = await handle.db
      .delete(loginThrottle)
      .where(eq(loginThrottle.usernameKey, usernameKey))
      .returning();
    await handle.db
      .update(twoFactor)
      .set(NOT_LOCKED)
      .where(
        inArray(
          twoFactor.userId,
          handle.db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.username, usernameKey)),
        ),
      );

    if (deleted.length === 0) {
      process.stdout.write(
        `Tài khoản "${values.username}" hiện không có bản ghi tạm khóa nào.\n`,
      );
    } else {
      process.stdout.write(
        `Đã gỡ tạm khóa cho tài khoản "${values.username}" (${deleted.length} bản ghi IP).\n`,
      );
    }
    return 0;
  } finally {
    await handle.close();
  }
}

main()
  .then((code) => {
    if (code !== 0) process.exit(code);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Lỗi gỡ khóa: ${message}\n`);
    process.exit(1);
  });
