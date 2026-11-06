// The dashboard bench writes 300 contracts and a year of ledger, which can
// never be deleted (append-only ledger). It runs on a database of its own
// only (dashboard-basic design D2): named *_bench, and never the database
// of DATABASE_URL or TEST_DATABASE_URL.
type Env = Readonly<Record<string, string | undefined>>;

export const BENCH_MESSAGES = {
  missing:
    "Thiếu BENCH_DATABASE_URL (owner) hoặc BENCH_APP_DATABASE_URL (erp_app). Xem docs/ops/dashboard-bench.md.",
  badName: (name: string) =>
    `Từ chối đo trên DB "${name}": tên DB đo phải kết thúc bằng _bench.`,
  sameAs: (name: string, variable: string) =>
    `Từ chối đo trên DB "${name}": trùng DB của ${variable}.`,
  twoDatabases:
    "BENCH_DATABASE_URL và BENCH_APP_DATABASE_URL phải trỏ cùng một DB.",
} as const;

export class BenchGuardError extends Error {}

/** The database name of a postgres:// URL, or "" when there is none. */
export function databaseName(url: string | undefined): string {
  if (!url || !URL.canParse(url)) return "";
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

/** Both bench URLs, or a BenchGuardError saying why not. */
export function benchTarget(env: Env): { owner: string; app: string } {
  const owner = env.BENCH_DATABASE_URL?.trim();
  const app = env.BENCH_APP_DATABASE_URL?.trim();
  if (!owner || !app) throw new BenchGuardError(BENCH_MESSAGES.missing);
  const name = databaseName(owner);
  if (databaseName(app) !== name) {
    throw new BenchGuardError(BENCH_MESSAGES.twoDatabases);
  }
  if (!name.endsWith("_bench")) {
    throw new BenchGuardError(BENCH_MESSAGES.badName(name));
  }
  for (const variable of [
    "DATABASE_URL",
    "DATABASE_URL_MIGRATE",
    "TEST_DATABASE_URL",
    "TEST_DATABASE_URL_MIGRATE",
  ]) {
    if (databaseName(env[variable]) === name) {
      throw new BenchGuardError(BENCH_MESSAGES.sameAs(name, variable));
    }
  }
  return { owner, app };
}
