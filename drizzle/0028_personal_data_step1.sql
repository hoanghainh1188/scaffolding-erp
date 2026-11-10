-- personal-data-protection step 1 (design D5): adds only. supplier.id_number
-- and supplier.bank_account stay in the database, unknown to the code, until
-- `npm run pii:backfill` has emptied them; step 2 drops them in its own PR.
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_action_check";
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_action_check" CHECK ("activity_log"."action" in ('CREATE', 'UPDATE', 'SUBMIT', 'APPROVE', 'POST', 'RETURN', 'CANCEL', 'CLOSE', 'DELETE_DRAFT', 'DELETE', 'SIGN_IN', 'START', 'REJECT', 'SEND', 'CLOSE_PERIOD', 'SETTLE', 'ASSIGN', 'RECALL', 'RECEIVE', 'REPORT', 'COUNT', 'ANONYMIZE'));
--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "id_number_enc" text;
--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "id_number_last4" text;
--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "bank_account_last4" text;
--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "tax_identity_enc" text;
--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "data_notice_version" integer;
--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "data_notice_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "data_notice_by" text;
--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "anonymized_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "anonymized_by" text;
--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "anonymize_requested_on" date;
--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_data_notice_by_user_id_fk" FOREIGN KEY ("data_notice_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_anonymized_by_user_id_fk" FOREIGN KEY ("anonymized_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_id_number_enc_check" CHECK ("supplier"."id_number_enc" is null or "supplier"."id_number_enc" ~ '^pii1\.[0-9]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$');
--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_tax_identity_enc_check" CHECK ("supplier"."tax_identity_enc" is null or "supplier"."tax_identity_enc" ~ '^pii1\.[0-9]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$');
--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_id_number_last4_check" CHECK ("supplier"."id_number_last4" is null or "supplier"."id_number_last4" ~ '^[0-9]{4}$');
--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_bank_account_last4_check" CHECK ("supplier"."bank_account_last4" is null or "supplier"."bank_account_last4" ~ '^[0-9]{4}$');
--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_id_number_pair_check" CHECK (("supplier"."id_number_enc" is null) = ("supplier"."id_number_last4" is null));
--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_tax_identity_check" CHECK ("supplier"."tax_identity_enc" is null or "supplier"."anonymized_at" is not null);
--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_anonymized_check" CHECK ("supplier"."anonymized_at" is null or ("supplier"."phone" is null and "supplier"."address" is null and "supplier"."tax_code" is null and "supplier"."note" is null and "supplier"."bank_name" is null and "supplier"."bank_account_last4" is null and "supplier"."id_number_enc" is null and "supplier"."id_number_last4" is null and "supplier"."status" = 'ARCHIVED'));
