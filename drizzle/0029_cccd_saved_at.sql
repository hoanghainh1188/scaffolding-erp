-- personal-data-protection fixes (review PR #176, item 5): `pii:purge` counts
-- the CCCD retention from max(last goods receipt, the day the CCCD was saved).
-- Rows that already hold a CCCD start from their last update: never earlier
-- than the real save, so nothing is purged sooner than before.
ALTER TABLE "supplier" ADD COLUMN "id_number_saved_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "supplier" SET "id_number_saved_at" = "updated_at" WHERE "id_number_enc" IS NOT NULL;
