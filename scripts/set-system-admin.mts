// Sets or clears the "Admin hệ thống" flag of an account (0.2 số 138).
//   npm run auth:set-admin -- --username quocbao
//   npm run auth:set-admin -- --username quocbao --off
import { parseArgs } from "node:util";

import { createDatabase } from "@/db/client";
import { setSystemAdmin } from "@/lib/auth/two-factor-admin";

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      username: { type: "string" },
      off: { type: "boolean", default: false },
    },
  });
  if (!values.username) {
    process.stderr.write(
      "Cách dùng: npm run auth:set-admin -- --username <tên-đăng-nhập> [--off]\n",
    );
    return 2;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    process.stderr.write(
      "Lỗi: Biến môi trường DATABASE_URL chưa được thiết lập.\n",
    );
    return 1;
  }
  const handle = createDatabase(databaseUrl);
  try {
    const result = await setSystemAdmin(
      handle.db,
      values.username,
      !values.off,
    );
    (result.ok ? process.stdout : process.stderr).write(`${result.message}\n`);
    return result.ok ? 0 : 1;
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
    process.stderr.write(`Lỗi: ${message}\n`);
    process.exit(1);
  });
