import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { getDatabase } from "@/db/client";
import { checkHealth, healthResponse, withPhotoStorage } from "@/lib/health";
import { photoStorageBytes } from "@/lib/returns/photos";

// No auth: used by monitoring. connection() keeps it out of prerendering so
// every request really asks the database.
export async function GET(): Promise<Response> {
  await connection();
  const report = await checkHealth(() => getDatabase().execute(sql`select 1`));
  return healthResponse(
    await withPhotoStorage(report, () => photoStorageBytes(getDatabase())),
  );
}
