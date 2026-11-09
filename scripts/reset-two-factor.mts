// Clears someone's second factor when no admin can do it on D17.
//   npm run auth:reset-2fa -- --username minhanh
import { parseArgs } from "node:util";

import { createDatabase } from "@/db/client";
import { resetTwoFactorByCli } from "@/lib/auth/two-factor-admin";

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { username: { type: "string" } } });
  if (!values.username) {
    process.stderr.write(
      "Cách dùng: npm run auth:reset-2fa -- --username <tên-đăng-nhập>\n",
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
    const result = await resetTwoFactorByCli(handle.db, values.username);
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
