// CHECKs of personal-data-protection step 1 (design D5). Runs as the owner:
// these are rows no service would write.
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { getAdminDatabase } from "@/test/admin";
import { truncateWithLedger } from "@/test/inventory";

const db = getAdminDatabase();
const CIPHERTEXT = "pii1.1.YWJjZGVmZ2hpamts.YWJjZGVmZ2hpamtsbW5vcA";

beforeEach(async () => {
  await truncateWithLedger(sql`truncate table "supplier" cascade`);
});

interface Row {
  idNumberEnc?: string | null;
  idNumberLast4?: string | null;
  bankLast4?: string | null;
  taxIdentity?: string | null;
  anonymizedAt?: Date | null;
  phone?: string | null;
  status?: string;
}

function insert(row: Row) {
  return db.execute(sql`
    insert into supplier (
      code, kind, name, search_text, status, phone, id_number_enc,
      id_number_last4, bank_account_last4, tax_identity_enc, anonymized_at
    ) values (
      'NCC-9001', 'PERSON', 'A', 'a', ${row.status ?? "ACTIVE"},
      ${row.phone ?? null}, ${row.idNumberEnc ?? null},
      ${row.idNumberLast4 ?? null}, ${row.bankLast4 ?? null},
      ${row.taxIdentity ?? null}, ${row.anonymizedAt?.toISOString() ?? null}
    )`);
}

async function constraint(row: Row): Promise<unknown> {
  const error = await insert(row).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  return (error as { cause?: { constraint_name?: string } } | undefined)?.cause
    ?.constraint_name;
}

describe("supplier personal data checks", () => {
  it("accepts a ciphertext with its last 4 digits", async () => {
    await expect(
      constraint({ idNumberEnc: CIPHERTEXT, idNumberLast4: "2345" }),
    ).resolves.toBeUndefined();
  });

  it("refuses a plain number in the ciphertext column", async () => {
    await expect(
      constraint({ idNumberEnc: "001203012345", idNumberLast4: "2345" }),
    ).resolves.toBe("supplier_id_number_enc_check");
  });

  it("refuses last-4 columns that are not 4 digits", async () => {
    await expect(
      constraint({ idNumberEnc: CIPHERTEXT, idNumberLast4: "234" }),
    ).resolves.toBe("supplier_id_number_last4_check");
    await expect(constraint({ bankLast4: "12345" })).resolves.toBe(
      "supplier_bank_account_last4_check",
    );
  });

  it("keeps the ciphertext and its last 4 digits together", async () => {
    await expect(constraint({ idNumberEnc: CIPHERTEXT })).resolves.toBe(
      "supplier_id_number_pair_check",
    );
    await expect(constraint({ idNumberLast4: "2345" })).resolves.toBe(
      "supplier_id_number_pair_check",
    );
  });

  it("allows a tax file only on an erased seller", async () => {
    await expect(constraint({ taxIdentity: CIPHERTEXT })).resolves.toBe(
      "supplier_tax_identity_check",
    );
    await expect(
      constraint({
        taxIdentity: "plain",
        anonymizedAt: new Date(),
        status: "ARCHIVED",
      }),
    ).resolves.toBe("supplier_tax_identity_enc_check");
    await expect(
      constraint({
        taxIdentity: CIPHERTEXT,
        anonymizedAt: new Date(),
        status: "ARCHIVED",
      }),
    ).resolves.toBeUndefined();
  });

  it("refuses an erased seller who still has personal data", async () => {
    const erased = { anonymizedAt: new Date(), status: "ARCHIVED" };
    await expect(constraint({ ...erased, phone: "0912345678" })).resolves.toBe(
      "supplier_anonymized_check",
    );
    await expect(
      constraint({
        ...erased,
        idNumberEnc: CIPHERTEXT,
        idNumberLast4: "2345",
      }),
    ).resolves.toBe("supplier_anonymized_check");
    await expect(
      constraint({ anonymizedAt: new Date(), status: "ACTIVE" }),
    ).resolves.toBe("supplier_anonymized_check");
  });
});
