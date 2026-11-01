CREATE TABLE "company_profile" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"tax_id" text,
	"address" text,
	"phone" text,
	"email" text,
	"website" text,
	"bank_account" text,
	"bank_name" text,
	"logo_url" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_profile_singleton_check" CHECK ("company_profile"."id" = 1),
	CONSTRAINT "company_profile_name_check" CHECK (length(trim("company_profile"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "company_profile" ADD CONSTRAINT "company_profile_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "company_profile" ("id", "name") VALUES (1, 'Công ty Cổ phần Cơ khí Xây dựng An Phát') ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "activity_log" DROP CONSTRAINT IF EXISTS "activity_log_document_type_check";
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_document_type_check" CHECK ("activity_log"."document_type" in ('PURCHASE_ORDER', 'GOODS_RECEIPT', 'REPAIR_ORDER', 'STOCKTAKE', 'STOCK_ADJUSTMENT', 'OPENING_BALANCE', 'ITEM', 'ITEM_GROUP', 'KIT', 'SUPPLIER', 'CUSTOMER', 'SITE', 'LOCATION', 'USER', 'SCRAP_PRICE', 'COMPANY_PROFILE'));