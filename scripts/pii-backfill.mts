// Step 1 of the two-step migration (personal-data-protection D5): encrypts
// the old CCCD column, keeps the last 4 digits of the old account, empties
// both. Prints counts only, never a number.
//   npm run pii:backfill          migrate
//   npm run pii:backfill -- --check   count what is left, exit 1 if any
import { parseArgs } from "node:util";

import { createDatabase } from "@/db/client";
import { backfillLegacyPii, countLegacyRows } from "@/lib/privacy/backfill";
import { safeFailureText } from "@/lib/privacy/cipher";
import { getPiiKeyRing } from "@/lib/privacy/key-ring";

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { check: { type: "boolean" } } });
  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write("Thiếu DATABASE_URL trong .env (xem .env.example).\n");
    return 1;
  }
  const handle = createDatabase(url);
  try {
    if (values.check) {
      const left = await countLegacyRows(handle.db);
      process.stdout.write(`Còn ${left} dòng có dữ liệu ở cột cũ.\n`);
      return left === 0 ? 0 : 1;
    }
    const result = await backfillLegacyPii(handle.db, getPiiKeyRing());
    process.stdout.write(
      `Đã chuyển ${result.migrated} dòng; bỏ ${result.accountsDropped} số tài khoản quá ngắn.\n`,
    );
    return 0;
  } finally {
    await handle.close();
  }
}

main()
  .then((code) => {
    // exitCode, not exit(): the printed count must reach the log.
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`Lỗi: ${safeFailureText(error)}\n`);
    process.exitCode = 1;
  });
