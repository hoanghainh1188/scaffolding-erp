CREATE TABLE "activity_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"device" text NOT NULL,
	"browser" text NOT NULL,
	"action" text NOT NULL,
	"document_type" text,
	"document_id" text,
	"document_code" text,
	"summary" text NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flags" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "activity_log_role_check" CHECK ("activity_log"."role" in ('DIRECTOR', 'ACCOUNTANT', 'SALES', 'WAREHOUSE', 'WORKSHOP')),
	CONSTRAINT "activity_log_device_check" CHECK ("activity_log"."device" in ('DESKTOP', 'MOBILE')),
	CONSTRAINT "activity_log_browser_check" CHECK ("activity_log"."browser" in ('EDGE', 'CHROME', 'COCCOC', 'SAFARI', 'FIREFOX', 'OTHER')),
	CONSTRAINT "activity_log_action_check" CHECK ("activity_log"."action" in ('CREATE', 'UPDATE', 'SUBMIT', 'APPROVE', 'POST', 'RETURN', 'CANCEL', 'CLOSE', 'DELETE_DRAFT', 'DELETE', 'SIGN_IN')),
	CONSTRAINT "activity_log_document_type_check" CHECK ("activity_log"."document_type" in ('PURCHASE_ORDER', 'GOODS_RECEIPT', 'REPAIR_ORDER', 'STOCKTAKE', 'STOCK_ADJUSTMENT', 'OPENING_BALANCE', 'ITEM', 'ITEM_GROUP', 'KIT', 'SUPPLIER', 'CUSTOMER', 'SITE', 'LOCATION', 'USER', 'SCRAP_PRICE')),
	CONSTRAINT "activity_log_sign_in_document_check" CHECK (("activity_log"."action" = 'SIGN_IN') = ("activity_log"."document_type" is null)),
	CONSTRAINT "activity_log_summary_check" CHECK (char_length("activity_log"."summary") between 1 and 300),
	CONSTRAINT "activity_log_changes_check" CHECK (jsonb_typeof("activity_log"."changes") = 'array'),
	CONSTRAINT "activity_log_flags_check" CHECK ("activity_log"."flags" <@ array['OFF_HOURS', 'SENSITIVE', 'ANOMALY']::text[])
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_created_idx" ON "activity_log" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_log_user_idx" ON "activity_log" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_log_document_idx" ON "activity_log" USING btree (lower("document_code"));--> statement-breakpoint
CREATE INDEX "activity_log_review_idx" ON "activity_log" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "activity_log"."flags" <> '{}'::text[];--> statement-breakpoint
-- Hand-written (activity-log design D2): the activity log is append-only,
-- like the ledger. TRUNCATE passes only where the ledger's does (a *_test
-- database with inventory.allow_truncate = 'on', src/test/inventory.ts).
CREATE FUNCTION "activity_log_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' AND "inventory_truncate_allowed"(
    current_database(),
    current_setting('inventory.allow_truncate', true)
  ) THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'Nhật ký thao tác chỉ ghi thêm'
    USING ERRCODE = 'P0001';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "activity_log_no_update_delete"
BEFORE UPDATE OR DELETE ON "activity_log"
FOR EACH ROW EXECUTE FUNCTION "activity_log_append_only"();
--> statement-breakpoint
CREATE TRIGGER "activity_log_no_truncate"
BEFORE TRUNCATE ON "activity_log"
FOR EACH STATEMENT EXECUTE FUNCTION "activity_log_append_only"();
