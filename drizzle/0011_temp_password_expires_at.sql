ALTER TABLE "user" ADD COLUMN "temp_password_expires_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "user"
SET "temp_password_expires_at" = now() + interval '48 hours'
WHERE "must_change_password" = true;
