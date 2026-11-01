import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  /** Closes the underlying connection pool. */
  close: () => Promise<void>;
}

export interface DatabaseOptions {
  /** Maximum number of connections in the pool (default 10). */
  max?: number;
  /** Seconds of inactivity before an idle connection closes (undefined = never). */
  idleTimeoutSeconds?: number;
  /** Seconds to wait before timing out while connecting (default 3). */
  connectTimeoutSeconds?: number;
  /** Whether to use prepared statements (default true). */
  prepare?: boolean;
}

const DEFAULT_CONNECT_TIMEOUT_SECONDS = 3;
const DEFAULT_POOL_MAX = 10;

/**
 * Opens a connection pool. Every session runs in UTC: timestamps are stored
 * as UTC and the business day is derived in Asia/Ho_Chi_Minh by the app.
 */
export function createDatabase(
  url: string,
  options: DatabaseOptions = {},
): DatabaseHandle {
  const client = postgres(url, {
    max: options.max ?? DEFAULT_POOL_MAX,
    idle_timeout: options.idleTimeoutSeconds,
    connect_timeout:
      options.connectTimeoutSeconds ?? DEFAULT_CONNECT_TIMEOUT_SECONDS,
    prepare: options.prepare ?? true,
    connection: { TimeZone: "UTC" },
    onnotice: () => {},
  });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  };
}

// Reuse one pool per server process, including across dev hot reloads.
const globalForDb = globalThis as typeof globalThis & {
  __erpDatabase?: DatabaseHandle;
};

function envPoolOptions(): DatabaseOptions {
  const max = process.env.DB_POOL_MAX
    ? Number(process.env.DB_POOL_MAX)
    : undefined;
  const idle = process.env.DB_IDLE_TIMEOUT_SECONDS
    ? Number(process.env.DB_IDLE_TIMEOUT_SECONDS)
    : undefined;
  const timeout = process.env.DB_CONNECT_TIMEOUT_SECONDS
    ? Number(process.env.DB_CONNECT_TIMEOUT_SECONDS)
    : undefined;
  const prepareRaw = process.env.DB_PREPARE?.trim().toLowerCase();
  const prepare =
    prepareRaw !== undefined
      ? !["false", "0", "no"].includes(prepareRaw)
      : undefined;

  return {
    max: Number.isFinite(max) && max! > 0 ? max : undefined,
    idleTimeoutSeconds: Number.isFinite(idle) && idle! >= 0 ? idle : undefined,
    connectTimeoutSeconds:
      Number.isFinite(timeout) && timeout! > 0 ? timeout : undefined,
    prepare,
  };
}

/** The app's shared database, connected on first use. */
export function getDatabase(): Database {
  if (!globalForDb.__erpDatabase) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set.");
    }
    globalForDb.__erpDatabase = createDatabase(url, envPoolOptions());
  }
  return globalForDb.__erpDatabase.db;
}
