-- personal-data-protection step 2 (design D5, tasks 12.2): drops the old
-- plain-text columns supplier.id_number and supplier.bank_account. The
-- drizzle snapshot no longer has them, so this is written by hand. Stops,
-- naming only a count, if `npm run pii:backfill` has not emptied them: run
-- it with the step 1 build, then migrate again. The CHECK
-- supplier_id_number_check goes with its column.
DO $$
DECLARE
  remaining integer;
BEGIN
  SELECT count(*) INTO remaining FROM "supplier"
  WHERE "id_number" IS NOT NULL OR "bank_account" IS NOT NULL;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'pii step 2: % supplier rows still hold id_number or bank_account; run pii:backfill first', remaining;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "supplier" DROP CONSTRAINT IF EXISTS "supplier_id_number_check";
--> statement-breakpoint
ALTER TABLE "supplier" DROP COLUMN "id_number";
--> statement-breakpoint
ALTER TABLE "supplier" DROP COLUMN "bank_account";
