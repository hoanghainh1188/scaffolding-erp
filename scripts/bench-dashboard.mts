// Times every D1 block on a database of its own (dashboard-basic design D2,
// task 7.1): 300 rental contracts and a year of deliveries and returns,
// written through the real services in date order, then each block read
// twice. Refuses any database not named *_bench (src/lib/dashboard/
// bench-guard.ts): the ledger can never be cleaned. See
// docs/ops/dashboard-bench.md.
//   BENCH_DATABASE_URL=… BENCH_APP_DATABASE_URL=… npm run bench:dashboard
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

import {
  BenchGuardError,
  benchTarget,
} from "../src/lib/dashboard/bench-guard.ts";

const CONTRACTS = Number(process.env.BENCH_CONTRACTS ?? 300);
const DAYS = 360;

function prepare(owner: string, app: string): void {
  const env = {
    ...process.env,
    DATABASE_URL: app,
    DATABASE_URL_MIGRATE: owner,
  };
  for (const args of [
    ["scripts/db-roles.mts"],
    ["--import", "./scripts/register-aliases.mjs", "src/db/migrate.mts"],
  ]) {
    const run = spawnSync(process.execPath, args, { env, stdio: "inherit" });
    if (run.status !== 0) throw new Error(`${args.at(-1)} failed`);
  }
}

const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * 86_400_000);
/** 10:00 in Vietnam on the day. */
const at = (day: Date) => new Date(`${iso(day)}T03:00:00Z`);

async function seed(): Promise<void> {
  const { createTestContext } = await import("../src/test/auth.ts");
  const { setupContractFixture, d5Rental } =
    await import("../src/test/contracts.ts");
  const { approvedContract, deliverMoreAt, openingAt } =
    await import("./bench-dashboard-helpers.mts");
  const { returnOf } = await import("../src/test/returns.ts");
  const ctx = createTestContext();
  try {
    const fx = await setupContractFixture(ctx, { reset: false });
    const start = addDays(new Date(), -DAYS);
    const yard = await openingAt(ctx, fx, at(addDays(start, -1)), CONTRACTS);
    const sites = [
      fx.site("Trường THCS Dương Nội"),
      fx.site("Chung cư An Phú – Block B"),
    ];
    type Event = { day: Date; run: () => Promise<void> };
    const events: Event[] = [];
    for (let i = 0; i < CONTRACTS; i += 1) {
      const day = addDays(start, Math.floor((i * (DAYS - 5)) / CONTRACTS));
      const deal = await approvedContract(ctx, fx, {
        ...d5Rental(fx),
        siteId: sites[i % sites.length] ?? "",
        signedDate: iso(addDays(day, -3)),
        startDate: iso(day),
        endDate: iso(addDays(day, 120)),
        batches: [],
      });
      events.push({
        day,
        run: () => deliverMoreAt(ctx, { ...fx, yard }, deal.id, at(day)),
      });
      const back = addDays(day, 50);
      if (i % 2 === 0 && back < addDays(new Date(), -1)) {
        events.push({
          day: back,
          run: async () => {
            const posted = await returnOf(
              ctx,
              { ...fx, yard, deal, siteLocation: "", place: async () => yard },
              { "GG-K17": [4, 1, 0, 0], "GG-CH": [10, 0, 0, 0] },
              { now: at(back) },
            );
            if (!posted.ok) throw new Error(posted.error);
          },
        });
      }
    }
    events.sort((a, b) => a.day.getTime() - b.day.getTime());
    for (const [index, event] of events.entries()) {
      await event.run();
      if (index % 50 === 0) {
        process.stdout.write(`  ${index}/${events.length} chứng từ\n`);
      }
    }
  } finally {
    await ctx.close();
  }
}

async function time(): Promise<void> {
  const { createDatabase } = await import("../src/db/client.ts");
  const { toBusinessDate } = await import("../src/domain/business-date.ts");
  const { pendingApprovals } =
    await import("../src/lib/dashboard/approvals.ts");
  const { overdueSummary } = await import("../src/lib/dashboard/overdue.ts");
  const { riskySites } = await import("../src/lib/dashboard/risk.ts");
  const { onSiteSummary, stockByCondition } =
    await import("../src/lib/dashboard/stock.ts");
  const { readBook, revenueSummary, topOfYear } =
    await import("../src/lib/dashboard/summary.ts");
  const handle = createDatabase(process.env.BENCH_APP_DATABASE_URL ?? "");
  const db = handle.db;
  const today = toBusinessDate(new Date());
  const viewer = { role: "DIRECTOR", contractScope: "ALL" } as const;
  const blocks: [string, () => Promise<unknown>][] = [
    ["Chờ duyệt", () => pendingApprovals(db, viewer)],
    ["Công nợ quá hạn", () => overdueSummary(db, today)],
    ["Hàng ở ngoài", () => onSiteSummary(db)],
    ["Tồn kho", () => stockByCondition(db)],
    ["Công trình rủi ro", () => riskySites(db, viewer, today)],
    [
      "Doanh số (sổ + tóm tắt)",
      async () => revenueSummary(await readBook(db, today), today),
    ],
    [
      "Top 5 (gồm sổ)",
      async () => topOfYear(db, await readBook(db, today), today),
    ],
  ];
  try {
    for (const round of ["lần 1", "lần 2"]) {
      process.stdout.write(`\n${round}\n`);
      for (const [name, run] of blocks) {
        const started = performance.now();
        await run();
        const ms = Math.round(performance.now() - started);
        process.stdout.write(`  ${name.padEnd(26)} ${ms} ms\n`);
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
  // The test helpers read these: point them at the bench database only.
  process.env.TEST_DATABASE_URL = target.app;
  process.env.TEST_DATABASE_URL_MIGRATE = target.owner;
  prepare(target.owner, target.app);
  if (process.env.BENCH_SKIP_SEED !== "1") {
    process.stdout.write(`Sinh ${CONTRACTS} hợp đồng thuê, ${DAYS} ngày…\n`);
    await seed();
  }
  await time();
  return 0;
}

process.exitCode = await main();
