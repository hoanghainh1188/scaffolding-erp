// Times D15 on the bench database (management-reports design D4, task
// 6.1). Runs bench:dashboard first, which refuses any database not named
// *_bench, migrates it and writes 300 rental contracts and a year of
// deliveries and returns (BENCH_SKIP_SEED=1 keeps the data already
// there); then reads every D15 block twice, for this month and this year.
// See docs/ops/reports-bench.md.
//   BENCH_DATABASE_URL=… BENCH_APP_DATABASE_URL=… npm run bench:reports
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

import {
  BenchGuardError,
  benchTarget,
} from "../src/lib/dashboard/bench-guard.ts";

async function time(app: string): Promise<void> {
  const { createDatabase } = await import("../src/db/client.ts");
  const { toBusinessDate } = await import("../src/domain/business-date.ts");
  const { parsePeriod, periodRange, previousPeriod, yearToDate } =
    await import("../src/domain/report-period.ts");
  const { reportRevenue } = await import("../src/lib/reports/revenue.ts");
  const { ledgerSums, repairSums } =
    await import("../src/lib/reports/costs.ts");
  const { reportFleet } = await import("../src/lib/reports/fleet.ts");
  const { customerRanking } = await import("../src/lib/reports/ranking.ts");
  const { buildReport } = await import("../src/lib/reports/report.ts");
  const { reportWorkbook } = await import("../src/lib/reports/export.ts");
  const handle = createDatabase(app);
  const db = handle.db;
  const today = toBusinessDate(new Date());
  try {
    for (const kind of ["month", "year"] as const) {
      const period = parsePeriod(
        kind,
        today.slice(0, kind === "year" ? 4 : 7),
        today,
      );
      const ytd = yearToDate(period, today);
      const read = {
        from:
          previousPeriod(period).from < ytd.from
            ? previousPeriod(period).from
            : ytd.from,
        to: today,
      };
      const range = periodRange(period, today);
      const blocks: [string, () => Promise<unknown>][] = [
        ["Doanh thu (sổ D1)", () => reportRevenue(db, read, today)],
        [
          "Giá vốn (sổ kho)",
          () => Promise.all([ledgerSums(db, read), repairSums(db, read)]),
        ],
        [
          "Hàng cho thuê theo ngày",
          () => reportFleet(db, { from: ytd.from, to: range.to }),
        ],
        [
          "Xếp hạng (gồm sổ)",
          async () =>
            customerRanking(
              db,
              (await reportRevenue(db, read, today)).book,
              ytd.from,
              today,
            ),
        ],
        ["Cả trang", () => buildReport(db, period, today)],
        [
          "Excel (cả trang)",
          async () => reportWorkbook(await buildReport(db, period, today)),
        ],
      ];
      for (const round of ["lần 1", "lần 2"]) {
        process.stdout.write(`\nKỳ ${period.value}, ${round}\n`);
        for (const [name, run] of blocks) {
          const started = performance.now();
          await run();
          const ms = Math.round(performance.now() - started);
          process.stdout.write(`  ${name.padEnd(26)} ${ms} ms\n`);
        }
      }
    }
  } finally {
    await handle.close();
  }
}

async function main(): Promise<number> {
  let target: { owner: string; app: string };
  try {
    target = benchTarget(process.env);
  } catch (error: unknown) {
    if (error instanceof BenchGuardError) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  }
  const seeded = spawnSync(
    process.execPath,
    [
      "--env-file-if-exists=.env",
      "--import",
      "./scripts/register-aliases.mjs",
      "scripts/bench-dashboard.mts",
    ],
    { stdio: "inherit", env: process.env },
  );
  if (seeded.status !== 0) return seeded.status ?? 1;
  await time(target.app);
  return 0;
}

process.exitCode = await main();
