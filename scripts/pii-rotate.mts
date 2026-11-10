// Moves every encrypted value to the first key of PII_ENCRYPTION_KEYS
// (personal-data-protection D4). Safe to re-run; prints counts only.
//   npm run pii:rotate -- [--batch 100]
//   npm run pii:rotate -- --check   count what is left, exit 1 if any
import { parseArgs } from "node:util";

import { createDatabase } from "@/db/client";
import { safeFailureText } from "@/lib/privacy/cipher";
import { getPiiKeyRing } from "@/lib/privacy/key-ring";
import {
  DEFAULT_ROTATE_BATCH,
  countStaleCiphertexts,
  rotatePiiKeys,
} from "@/lib/privacy/rotate";

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { check: { type: "boolean" }, batch: { type: "string" } },
  });
  const batch = Number(values.batch ?? DEFAULT_ROTATE_BATCH);
  if (!Number.isInteger(batch) || batch < 1) {
    process.stderr.write("--batch phải là số nguyên dương.\n");
    return 2;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write("Thiếu DATABASE_URL trong .env (xem .env.example).\n");
    return 1;
  }
  const handle = createDatabase(url);
  try {
    const ring = getPiiKeyRing();
    if (values.check) {
      const left = await countStaleCiphertexts(handle.db, ring);
      process.stdout.write(`Còn ${left} bản mã dùng khóa cũ.\n`);
      return left === 0 ? 0 : 1;
    }
    const done = await rotatePiiKeys(handle.db, ring, { batch });
    process.stdout.write(`Đã đổi khóa ${done} dòng.\n`);
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
