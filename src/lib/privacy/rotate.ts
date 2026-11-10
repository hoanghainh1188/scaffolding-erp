// `npm run pii:rotate` (personal-data-protection D4): re-encrypts every value
// not yet under the first key, batch by batch. A finished row leaves the
// filter by itself, so an interrupted run just runs again. updated_at stays:
// the value did not change.
import { and, asc, isNotNull, not, like, or, eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { supplier } from "@/db/schema";

import {
  ciphertextPrefix,
  decryptIdNumber,
  decryptTaxIdentity,
  encryptIdNumber,
  encryptTaxIdentity,
  type PiiKeyRing,
} from "./cipher";

export const DEFAULT_ROTATE_BATCH = 100;

export interface RotateOptions {
  batch?: number;
  /** Stops after this many batches (an interrupted run, in tests). */
  maxBatches?: number;
}

function staleCondition(ring: PiiKeyRing) {
  const pattern = `${ciphertextPrefix(ring.current)}%`;
  return or(
    and(
      isNotNull(supplier.idNumberEnc),
      not(like(supplier.idNumberEnc, pattern)),
    ),
    and(
      isNotNull(supplier.taxIdentityEnc),
      not(like(supplier.taxIdentityEnc, pattern)),
    ),
  );
}

/** How many rows still hold a value under an older key. */
export async function countStaleCiphertexts(
  db: Database,
  ring: PiiKeyRing,
): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(supplier)
    .where(staleCondition(ring));
  return row?.value ?? 0;
}

type Row = {
  id: string;
  idNumberEnc: string | null;
  taxIdentityEnc: string | null;
};

function reencrypted(row: Row, ring: PiiKeyRing) {
  const prefix = ciphertextPrefix(ring.current);
  const isStale = (value: string | null): value is string =>
    value !== null && !value.startsWith(prefix);
  return {
    idNumberEnc: isStale(row.idNumberEnc)
      ? encryptIdNumber(
          row.id,
          decryptIdNumber(row.id, row.idNumberEnc, ring),
          ring,
        )
      : row.idNumberEnc,
    taxIdentityEnc: isStale(row.taxIdentityEnc)
      ? encryptTaxIdentity(
          row.id,
          decryptTaxIdentity(row.id, row.taxIdentityEnc, ring),
          ring,
        )
      : row.taxIdentityEnc,
  };
}

async function rotateBatch(
  db: Database,
  ring: PiiKeyRing,
  size: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: supplier.id,
        idNumberEnc: supplier.idNumberEnc,
        taxIdentityEnc: supplier.taxIdentityEnc,
      })
      .from(supplier)
      .where(staleCondition(ring))
      .orderBy(asc(supplier.id))
      .limit(size)
      .for("update", { skipLocked: true });
    for (const row of rows) {
      await tx
        .update(supplier)
        .set(reencrypted(row, ring))
        .where(eq(supplier.id, row.id));
    }
    return rows.length;
  });
}

/** Rows re-encrypted by this run. */
export async function rotatePiiKeys(
  db: Database,
  ring: PiiKeyRing,
  options: RotateOptions = {},
): Promise<number> {
  const size = options.batch ?? DEFAULT_ROTATE_BATCH;
  let total = 0;
  for (let batch = 0; batch < (options.maxBatches ?? Infinity); batch += 1) {
    const done = await rotateBatch(db, ring, size);
    total += done;
    if (done < size) break;
  }
  return total;
}
