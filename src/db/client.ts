import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  /** Closes the underlying connection pool. */
  close: () => Promise<void>;
}

const CONNECT_TIMEOUT_SECONDS = 3;

/**
 * Opens a connection pool. Every session runs in UTC: timestamps are stored
 * as UTC and the business day is derived in Asia/Ho_Chi_Minh by the app.
 */
export function createDatabase(url: string): DatabaseHandle {
  const client = postgres(url, {
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
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

/** The app's shared database, connected on first use. */
export function getDatabase(): Database {
  if (!globalForDb.__erpDatabase) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set.");
    }
    globalForDb.__erpDatabase = createDatabase(url);
  }
  return globalForDb.__erpDatabase.db;
}
