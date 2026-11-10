// Deletes CCCD numbers and tax files past their retention period
// (personal-data-protection D7). Safe to re-run; prints counts only.
//   npm run pii:purge
import { createDatabase } from "@/db/client";
import { safeFailureText } from "@/lib/privacy/cipher";
import { purgeActor, purgeExpiredPii } from "@/lib/privacy/purge";

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write("Thiếu DATABASE_URL trong .env (xem .env.example).\n");
    return 1;
  }
  const handle = createDatabase(url);
  try {
    const actor = await purgeActor(handle.db);
    if (!actor) {
      process.stderr.write("Không có tài khoản Giám đốc đang hoạt động.\n");
      return 1;
    }
    const result = await purgeExpiredPii(handle.db, actor);
    process.stdout.write(
      `Đã xóa ${result.taxFiles} gói hồ sơ thuế, ${result.idNumbers} số CCCD.\n`,
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
