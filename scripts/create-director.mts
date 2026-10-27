// Creates the first Giám đốc and prints its temporary password once.
//   npm run auth:create-director -- --username minhanh --name "Minh Anh"
// Needs DATABASE_URL and BETTER_AUTH_SECRET (and BETTER_AUTH_URL in
// production). Refuses when an active director already exists.
import { parseArgs } from "node:util";

import { createDatabase } from "@/db/client";
import { createAuth } from "@/lib/auth/auth";
import { getEnv } from "@/lib/env";
import { createFirstDirector } from "@/lib/users/first-director";

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { username: { type: "string" }, name: { type: "string" } },
  });
  if (!values.username || !values.name) {
    process.stderr.write(
      'Cách dùng: npm run auth:create-director -- --username minhanh --name "Minh Anh"\n',
    );
    return 2;
  }
  const env = getEnv();
  const handle = createDatabase(env.DATABASE_URL);
  try {
    const auth = createAuth({
      db: handle.db,
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
    });
    const result = await createFirstDirector(
      { db: handle.db, auth },
      { username: values.username, name: values.name },
    );
    if (!result.ok) {
      process.stderr.write(`${result.error}\n`);
      return 1;
    }
    // Printed once, here only: it is not stored or logged anywhere else.
    process.stdout.write(
      [
        `Đã tạo tài khoản Giám đốc "${result.data.username}".`,
        `Mật khẩu tạm: ${result.data.tempPassword}`,
        "Mật khẩu này chỉ hiện một lần. Lần đầu đăng nhập phải đổi mật khẩu mới.",
        "",
      ].join("\n"),
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
    process.stderr.write(`Không tạo được tài khoản: ${message}\n`);
    process.exit(1);
  },
);
