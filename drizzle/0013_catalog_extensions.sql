-- catalog-extensions (09): real item codes, old codes (item_alias), 9 units,
-- item group category, site province, customer sales staff.
-- code_key is a generated column: existing rows get it at once.
--
-- Rollback (by hand, owner role): drop item_alias, the new columns and
-- indexes, and recreate the old CHECKs (item_code_check / kit_code_check
-- '^[A-Z0-9]+(-[A-Z0-9]+)*$' 2..20 chars, item_unit_check PIECE/KG,
-- item_weight_check, item_rental_unit_check, purchase_order_line_unit_check).
-- Only possible while no item, kit or order line uses a new code or unit:
-- archive or delete those first.
CREATE TABLE "item_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"code" text NOT NULL,
	"code_key" text GENERATED ALWAYS AS (lower(translate("code", 'ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ ', 'AAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD'))) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "item_alias_code_key_unique" UNIQUE("code_key"),
	CONSTRAINT "item_alias_code_check" CHECK (char_length("item_alias"."code") between 2 and 30 and "item_alias"."code" = upper("item_alias"."code") and "item_alias"."code" = btrim("item_alias"."code") and "item_alias"."code" !~ '[,*+ -]{2}' and "item_alias"."code" !~ '^[,*+ -]|[,*+ -]$')
);
--> statement-breakpoint
ALTER TABLE "item" DROP CONSTRAINT "item_rental_unit_check";--> statement-breakpoint
ALTER TABLE "item" DROP CONSTRAINT "item_unit_check";--> statement-breakpoint
ALTER TABLE "item" DROP CONSTRAINT "item_weight_check";--> statement-breakpoint
ALTER TABLE "item" DROP CONSTRAINT "item_code_check";--> statement-breakpoint
ALTER TABLE "kit" DROP CONSTRAINT "kit_code_check";--> statement-breakpoint
ALTER TABLE "purchase_order_line" DROP CONSTRAINT "purchase_order_line_unit_check";--> statement-breakpoint
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_document_type_check";--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "sales_user_id" text;--> statement-breakpoint
ALTER TABLE "item" ADD COLUMN "code_key" text GENERATED ALWAYS AS (lower(translate("code", 'ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ ', 'AAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD'))) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "item_group" ADD COLUMN "category" text DEFAULT 'EQUIPMENT' NOT NULL;--> statement-breakpoint
ALTER TABLE "kit" ADD COLUMN "code_key" text GENERATED ALWAYS AS (lower(translate("code", 'ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ ', 'AAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD'))) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN "province" text;--> statement-breakpoint
ALTER TABLE "item_alias" ADD CONSTRAINT "item_alias_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_alias" ADD CONSTRAINT "item_alias_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_alias_item_idx" ON "item_alias" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_sales_user_id_user_id_fk" FOREIGN KEY ("sales_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_sales_user_idx" ON "customer" USING btree ("sales_user_id");--> statement-breakpoint
CREATE INDEX "site_province_idx" ON "site" USING btree ("province");--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_code_key_unique" UNIQUE("code_key");--> statement-breakpoint
ALTER TABLE "kit" ADD CONSTRAINT "kit_code_key_unique" UNIQUE("code_key");--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_unit_check" CHECK ("item"."unit" in ('PIECE', 'BAR', 'BUNDLE', 'BASKET', 'ROLL', 'BOX', 'CARTON', 'METER', 'KG'));--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_weight_check" CHECK (("item"."unit" = 'KG' and "item"."standard_weight_kg" is null) or ("item"."unit" <> 'KG' and "item"."standard_weight_kg" is not null and "item"."standard_weight_kg" > 0));--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_code_check" CHECK (char_length("item"."code") between 2 and 30 and "item"."code" = upper("item"."code") and "item"."code" = btrim("item"."code") and "item"."code" !~ '[,*+ -]{2}' and "item"."code" !~ '^[,*+ -]|[,*+ -]$');--> statement-breakpoint
ALTER TABLE "item_group" ADD CONSTRAINT "item_group_category_check" CHECK ("item_group"."category" in ('EQUIPMENT', 'MATERIAL'));--> statement-breakpoint
ALTER TABLE "kit" ADD CONSTRAINT "kit_code_check" CHECK (char_length("kit"."code") between 2 and 30 and "kit"."code" = upper("kit"."code") and "kit"."code" = btrim("kit"."code") and "kit"."code" !~ '[,*+ -]{2}' and "kit"."code" !~ '^[,*+ -]|[,*+ -]$');--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_unit_check" CHECK ("purchase_order_line"."unit" in ('PIECE', 'BAR', 'BUNDLE', 'BASKET', 'ROLL', 'BOX', 'CARTON', 'METER', 'KG'));--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_document_type_check" CHECK ("activity_log"."document_type" in ('PURCHASE_ORDER', 'GOODS_RECEIPT', 'REPAIR_ORDER', 'STOCKTAKE', 'STOCK_ADJUSTMENT', 'OPENING_BALANCE', 'ITEM', 'ITEM_GROUP', 'KIT', 'SUPPLIER', 'CUSTOMER', 'SITE', 'LOCATION', 'USER', 'SCRAP_PRICE', 'COMPANY_PROFILE'));