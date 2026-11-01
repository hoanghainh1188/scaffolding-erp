// The owner connection of the integration-test database (db-least-privilege
// D5). Code under test runs as the app role (TEST_DATABASE_URL), which may
// not TRUNCATE or touch sequences; table resets and checks of the
// append-only triggers use this connection instead.
import {
  createDatabase,
  type Database,
  type DatabaseHandle,
} from "@/db/client";

const store = globalThis as typeof globalThis & {
  __erpTestAdmin?: DatabaseHandle;
};

/** The owner connection, opened on first use and shared within a test file. */
export function getAdminDatabase(): Database {
  if (!store.__erpTestAdmin) {
    const url = process.env.TEST_DATABASE_URL_MIGRATE;
    if (!url) {
      throw new Error(
        "TEST_DATABASE_URL_MIGRATE is required for integration tests.",
      );
    }
    store.__erpTestAdmin = createDatabase(url, { max: 2 });
  }
  return store.__erpTestAdmin.db;
}

/** Closes the owner connection; the integration setup file calls it. */
export async function closeAdminDatabase(): Promise<void> {
  const handle = store.__erpTestAdmin;
  store.__erpTestAdmin = undefined;
  await handle?.close();
}
