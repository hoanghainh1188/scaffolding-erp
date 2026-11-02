CREATE TABLE "contract" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"site_id" uuid,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"sales_user_id" text,
	"customer_token" text NOT NULL,
	"last_amendment_number" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_code_unique" UNIQUE("code"),
	CONSTRAINT "contract_type_check" CHECK ("contract"."type" in ('RENTAL', 'SALE')),
	CONSTRAINT "contract_status_check" CHECK ("contract"."status" in ('DRAFT', 'PENDING', 'APPROVED', 'ACTIVE', 'CLOSED', 'CANCELLED')),
	CONSTRAINT "contract_site_check" CHECK ("contract"."type" = 'SALE' or "contract"."site_id" is not null),
	CONSTRAINT "contract_customer_token_check" CHECK ("contract"."customer_token" ~ '^[A-Z0-9]{1,20}$'),
	CONSTRAINT "contract_amendment_number_check" CHECK ("contract"."last_amendment_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "contract_compensation" (
	"revision_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"lost_price" bigint,
	"damage_price" bigint,
	"catalog_lost_price" bigint,
	"catalog_damage_price" bigint,
	CONSTRAINT "contract_compensation_revision_id_item_id_pk" PRIMARY KEY("revision_id","item_id"),
	CONSTRAINT "contract_compensation_price_check" CHECK (coalesce("contract_compensation"."lost_price", 0) >= 0 and coalesce("contract_compensation"."damage_price", 0) >= 0 and coalesce("contract_compensation"."catalog_lost_price", 0) >= 0 and coalesce("contract_compensation"."catalog_damage_price", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "contract_delivery_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"planned_date" date NOT NULL,
	"note" text,
	CONSTRAINT "contract_delivery_batch_seq_unique" UNIQUE("revision_id","seq"),
	CONSTRAINT "contract_delivery_batch_note_check" CHECK ("contract_delivery_batch"."note" is null or length("contract_delivery_batch"."note") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "contract_delivery_batch_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"kit_id" uuid,
	"item_id" uuid,
	"quantity" numeric(14, 3) NOT NULL,
	CONSTRAINT "contract_delivery_batch_line_check" CHECK (("contract_delivery_batch_line"."kit_id" is null) <> ("contract_delivery_batch_line"."item_id" is null) and "contract_delivery_batch_line"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "contract_deposit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"kind" text NOT NULL,
	"amount" bigint NOT NULL,
	"method" text,
	"bank_name" text,
	"guarantee_number" text,
	"expiry_date" date,
	CONSTRAINT "contract_deposit_shape_check" CHECK ("contract_deposit"."amount" > 0 and (("contract_deposit"."kind" = 'CASH' and "contract_deposit"."method" is not null and "contract_deposit"."method" in ('CASH', 'TRANSFER') and "contract_deposit"."bank_name" is null and "contract_deposit"."guarantee_number" is null and "contract_deposit"."expiry_date" is null) or ("contract_deposit"."kind" = 'GUARANTEE' and "contract_deposit"."method" is null and "contract_deposit"."bank_name" is not null and "contract_deposit"."guarantee_number" is not null and length("contract_deposit"."bank_name") between 1 and 100 and length("contract_deposit"."guarantee_number") between 1 and 50 and "contract_deposit"."expiry_date" is not null)))
);
--> statement-breakpoint
CREATE TABLE "contract_kit" (
	"revision_id" uuid NOT NULL,
	"kit_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "contract_kit_revision_id_kit_id_pk" PRIMARY KEY("revision_id","kit_id"),
	CONSTRAINT "contract_kit_quantity_check" CHECK ("contract_kit"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "contract_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"condition" text,
	"pricing_unit" text DEFAULT 'ITEM' NOT NULL,
	"own_quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"price" bigint,
	"catalog_price" bigint,
	CONSTRAINT "contract_line_unique" UNIQUE NULLS NOT DISTINCT("revision_id","item_id","condition","pricing_unit"),
	CONSTRAINT "contract_line_condition_check" CHECK ("contract_line"."condition" is null or "contract_line"."condition" in ('NEW', 'GOOD', 'SCRAP')),
	CONSTRAINT "contract_line_pricing_unit_check" CHECK ("contract_line"."pricing_unit" in ('ITEM', 'KG') and ("contract_line"."condition" is distinct from 'SCRAP' or "contract_line"."pricing_unit" = 'KG')),
	CONSTRAINT "contract_line_quantity_check" CHECK ("contract_line"."quantity" > 0 and "contract_line"."own_quantity" >= 0 and "contract_line"."own_quantity" <= "contract_line"."quantity"),
	CONSTRAINT "contract_line_price_check" CHECK (("contract_line"."price" is null or "contract_line"."price" >= 0) and ("contract_line"."catalog_price" is null or "contract_line"."catalog_price" >= 0))
);
--> statement-breakpoint
CREATE TABLE "contract_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"kind" text NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"based_on_revision_id" uuid,
	"effective_from" date NOT NULL,
	"reason" text,
	"signed_date" date,
	"start_date" date NOT NULL,
	"end_date" date,
	"min_rental_days" integer,
	"billing_cycle" text,
	"payment_terms_days" integer NOT NULL,
	"vat_enabled" boolean DEFAULT false NOT NULL,
	"vat_rate" numeric(5, 2),
	"company_truck" boolean DEFAULT false NOT NULL,
	"freight_per_trip" bigint,
	"note" text,
	"submitted_by" text,
	"submitted_at" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"approval_reason" text,
	"overdue_amount" bigint,
	"overdue_days" integer,
	"returned_reason" text,
	"cancelled_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_revision_code_unique" UNIQUE("code"),
	CONSTRAINT "contract_revision_number_unique" UNIQUE("contract_id","number"),
	CONSTRAINT "contract_revision_kind_check" CHECK (("contract_revision"."kind" = 'ORIGINAL' and "contract_revision"."number" = 0 and "contract_revision"."effective_from" = "contract_revision"."start_date") or ("contract_revision"."kind" = 'AMENDMENT' and "contract_revision"."number" >= 1)),
	CONSTRAINT "contract_revision_status_check" CHECK ("contract_revision"."status" in ('DRAFT', 'PENDING', 'APPROVED', 'CANCELLED')),
	CONSTRAINT "contract_revision_approved_check" CHECK ("contract_revision"."status" <> 'APPROVED' or ("contract_revision"."approved_by" is not null and "contract_revision"."approved_at" is not null)),
	CONSTRAINT "contract_revision_dates_check" CHECK ("contract_revision"."end_date" is null or "contract_revision"."end_date" > "contract_revision"."start_date"),
	CONSTRAINT "contract_revision_terms_check" CHECK ("contract_revision"."payment_terms_days" between 0 and 365 and ("contract_revision"."min_rental_days" is null or "contract_revision"."min_rental_days" between 1 and 365) and ("contract_revision"."billing_cycle" is null or "contract_revision"."billing_cycle" = 'MONTH_END')),
	CONSTRAINT "contract_revision_vat_check" CHECK (("contract_revision"."vat_enabled" and "contract_revision"."vat_rate" is not null and "contract_revision"."vat_rate" > 0 and "contract_revision"."vat_rate" <= 20) or (not "contract_revision"."vat_enabled" and "contract_revision"."vat_rate" is null)),
	CONSTRAINT "contract_revision_money_check" CHECK (("contract_revision"."freight_per_trip" is null or "contract_revision"."freight_per_trip" >= 0) and ("contract_revision"."overdue_amount" is null or "contract_revision"."overdue_amount" >= 0)),
	CONSTRAINT "contract_revision_text_check" CHECK (("contract_revision"."reason" is null or length("contract_revision"."reason") between 1 and 500) and ("contract_revision"."approval_reason" is null or length("contract_revision"."approval_reason") between 1 and 500) and ("contract_revision"."note" is null or length("contract_revision"."note") between 1 and 1000))
);
--> statement-breakpoint
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_document_type_check";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "contract_scope" text DEFAULT 'ALL' NOT NULL;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_sales_user_id_user_id_fk" FOREIGN KEY ("sales_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_compensation" ADD CONSTRAINT "contract_compensation_revision_id_contract_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."contract_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_compensation" ADD CONSTRAINT "contract_compensation_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_delivery_batch" ADD CONSTRAINT "contract_delivery_batch_revision_id_contract_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."contract_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_delivery_batch_line" ADD CONSTRAINT "contract_delivery_batch_line_batch_id_contract_delivery_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."contract_delivery_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_delivery_batch_line" ADD CONSTRAINT "contract_delivery_batch_line_kit_id_kit_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."kit"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_delivery_batch_line" ADD CONSTRAINT "contract_delivery_batch_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_deposit" ADD CONSTRAINT "contract_deposit_revision_id_contract_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."contract_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_kit" ADD CONSTRAINT "contract_kit_revision_id_contract_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."contract_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_kit" ADD CONSTRAINT "contract_kit_kit_id_kit_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."kit"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_line" ADD CONSTRAINT "contract_line_revision_id_contract_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."contract_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_line" ADD CONSTRAINT "contract_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_revision" ADD CONSTRAINT "contract_revision_contract_id_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_revision" ADD CONSTRAINT "contract_revision_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_revision" ADD CONSTRAINT "contract_revision_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_revision" ADD CONSTRAINT "contract_revision_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_status_idx" ON "contract" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "contract_customer_idx" ON "contract" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "contract_site_idx" ON "contract" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "contract_sales_user_idx" ON "contract" USING btree ("sales_user_id");--> statement-breakpoint
CREATE INDEX "contract_delivery_batch_line_batch_idx" ON "contract_delivery_batch_line" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "contract_deposit_revision_idx" ON "contract_deposit" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "contract_kit_kit_idx" ON "contract_kit" USING btree ("kit_id");--> statement-breakpoint
CREATE INDEX "contract_line_item_idx" ON "contract_line" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_revision_open_amendment_unique" ON "contract_revision" USING btree ("contract_id") WHERE "contract_revision"."kind" = 'AMENDMENT' and "contract_revision"."status" in ('DRAFT', 'PENDING');--> statement-breakpoint
CREATE INDEX "contract_revision_effective_idx" ON "contract_revision" USING btree ("contract_id","status","effective_from");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_contract_scope_check" CHECK ("user"."contract_scope" in ('ALL', 'RENTAL', 'SALE'));--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_document_type_check" CHECK ("activity_log"."document_type" in ('PURCHASE_ORDER', 'GOODS_RECEIPT', 'REPAIR_ORDER', 'STOCKTAKE', 'STOCK_ADJUSTMENT', 'OPENING_BALANCE', 'ITEM', 'ITEM_GROUP', 'KIT', 'SUPPLIER', 'CUSTOMER', 'SITE', 'LOCATION', 'USER', 'SCRAP_PRICE', 'COMPANY_PROFILE', 'CONTRACT', 'CONTRACT_AMENDMENT'));--> statement-breakpoint
-- Hand-written (contracts design D2, D13): a revision the director approved
-- (the original or an amendment) and every row under it are frozen, even
-- for SQL typed by hand. The check reads OLD.status, so the approval itself
-- (PENDING -> APPROVED with approved_by/at and the overdue reason) passes;
-- any later UPDATE, approval_reason included, is refused. Changing the
-- terms after approval is what amendments are for (0.2 #16).
CREATE FUNCTION "contract_revision_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_status text;
BEGIN
  IF TG_TABLE_NAME = 'contract_revision' THEN
    parent_status := OLD.status;
  ELSIF TG_TABLE_NAME = 'contract_delivery_batch_line' THEN
    SELECT r.status INTO parent_status
      FROM "contract_delivery_batch" b
      JOIN "contract_revision" r ON r.id = b.revision_id
      WHERE b.id = COALESCE(OLD.batch_id, NEW.batch_id);
  ELSE
    SELECT status INTO parent_status FROM "contract_revision"
      WHERE id = COALESCE(OLD.revision_id, NEW.revision_id);
  END IF;
  IF parent_status = 'APPROVED' THEN
    RAISE EXCEPTION 'Bản hợp đồng đã duyệt không sửa được'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "contract_revision_approved_no_change"
BEFORE UPDATE OR DELETE ON "contract_revision"
FOR EACH ROW EXECUTE FUNCTION "contract_revision_frozen"();
--> statement-breakpoint
CREATE TRIGGER "contract_kit_approved_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "contract_kit"
FOR EACH ROW EXECUTE FUNCTION "contract_revision_frozen"();
--> statement-breakpoint
CREATE TRIGGER "contract_line_approved_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "contract_line"
FOR EACH ROW EXECUTE FUNCTION "contract_revision_frozen"();
--> statement-breakpoint
CREATE TRIGGER "contract_compensation_approved_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "contract_compensation"
FOR EACH ROW EXECUTE FUNCTION "contract_revision_frozen"();
--> statement-breakpoint
CREATE TRIGGER "contract_deposit_approved_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "contract_deposit"
FOR EACH ROW EXECUTE FUNCTION "contract_revision_frozen"();
--> statement-breakpoint
CREATE TRIGGER "contract_delivery_batch_approved_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "contract_delivery_batch"
FOR EACH ROW EXECUTE FUNCTION "contract_revision_frozen"();
--> statement-breakpoint
CREATE TRIGGER "contract_delivery_batch_line_approved_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "contract_delivery_batch_line"
FOR EACH ROW EXECUTE FUNCTION "contract_revision_frozen"();
