// Compares every closed rent period with the ledger (receivables task 6.3).
// Exit code 1 when a stored total differs from the one computed again.
//   npm run billing:check
import { createDatabase } from "@/db/client";
import { reconcileBilling } from "@/lib/billing/reconcile";

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write("Thiếu DATABASE_URL trong .env (xem .env.example).\n");
    return 1;
  }
  const handle = createDatabase(url);
  try {
    const problems = await reconcileBilling(handle.db);
    for (const problem of problems) process.stdout.write(`${problem}\n`);
    process.stdout.write(
      `Kỳ đã chốt ${problems.length === 0 ? "khớp" : "lệch"}: ${problems.length} lệch\n`,
    );
    return problems.length === 0 ? 0 : 1;
  } finally {
    await handle.close();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Đối chiếu thất bại: ${message}\n`);
    process.exit(1);
  },
);
