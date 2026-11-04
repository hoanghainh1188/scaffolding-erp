CREATE TABLE "billing_adjustment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"month" date NOT NULL,
	"ref_month" date NOT NULL,
	"amount" bigint NOT NULL,
	"reason" text NOT NULL,
	"closed_period_id" uuid,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_adjustment_month_check" CHECK (extract(day from "billing_adjustment"."month") = 1 and extract(day from "billing_adjustment"."ref_month") = 1 and "billing_adjustment"."ref_month" < "billing_adjustment"."month"),
	CONSTRAINT "billing_adjustment_amount_check" CHECK ("billing_adjustment"."amount" <> 0 and abs("billing_adjustment"."amount") <= 10000000000),
	CONSTRAINT "billing_adjustment_reason_check" CHECK (length(btrim("billing_adjustment"."reason")) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "billing_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"month" date NOT NULL,
	"period_end" date NOT NULL,
	"revision_id" uuid NOT NULL,
	"rent_amount" bigint NOT NULL,
	"adjustment_amount" bigint NOT NULL,
	"freight_amount" bigint NOT NULL,
	"vat_amount" bigint NOT NULL,
	"total_amount" bigint NOT NULL,
	"payment_terms_days" integer NOT NULL,
	"due_date" date NOT NULL,
	"holiday_days" integer NOT NULL,
	"line_count" integer NOT NULL,
	"created_xact" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	"closed_by" text NOT NULL,
	"closed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "billing_period_contract_month_unique" UNIQUE("contract_id","month"),
	CONSTRAINT "billing_period_month_check" CHECK (extract(day from "billing_period"."month") = 1 and "billing_period"."period_end" = ("billing_period"."month" + interval '1 month' - interval '1 day')::date),
	CONSTRAINT "billing_period_amount_check" CHECK ("billing_period"."rent_amount" >= 0 and "billing_period"."freight_amount" >= 0 and "billing_period"."vat_amount" >= 0 and "billing_period"."total_amount" = "billing_period"."rent_amount" + "billing_period"."adjustment_amount" + "billing_period"."freight_amount" + "billing_period"."vat_amount"),
	CONSTRAINT "billing_period_due_check" CHECK ("billing_period"."payment_terms_days" between 0 and 365 and "billing_period"."due_date" = "billing_period"."period_end" + "billing_period"."payment_terms_days"),
	CONSTRAINT "billing_period_count_check" CHECK ("billing_period"."holiday_days" >= 0 and "billing_period"."line_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "billing_period_freight" (
	"period_id" uuid NOT NULL,
	"delivery_note_id" uuid NOT NULL,
	"delivery_code" text NOT NULL,
	"batch_no" integer,
	"vehicle_plate" text,
	"business_date" date NOT NULL,
	"amount" bigint NOT NULL,
	"vat_rate" numeric(5, 2),
	CONSTRAINT "billing_period_freight_unique" UNIQUE("period_id","delivery_note_id"),
	CONSTRAINT "billing_period_freight_amount_check" CHECK ("billing_period_freight"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "billing_period_line" (
	"period_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"kind" text NOT NULL,
	"item_id" uuid,
	"item_code" text,
	"item_name" text,
	"quantity" numeric(14, 3),
	"from_date" date,
	"to_date" date,
	"calendar_days" integer,
	"holiday_days" integer,
	"charged_days" integer,
	"daily_price" bigint,
	"amount" bigint NOT NULL,
	"vat_rate" numeric(5, 2),
	"revision_code" text,
	"price_changed" boolean DEFAULT false NOT NULL,
	"in_document_type" text,
	"in_document_code" text,
	"in_date" date,
	"origin_date" date,
	"out_kind" text,
	"out_document_type" text,
	"out_document_code" text,
	"out_date" date,
	"adjustment_id" uuid,
	"ref_month" date,
	"note" text,
	CONSTRAINT "billing_period_line_no_unique" UNIQUE("period_id","line_no"),
	CONSTRAINT "billing_period_line_kind_check" CHECK ("billing_period_line"."kind" in ('RENT', 'MINIMUM', 'ADJUSTMENT')),
	CONSTRAINT "billing_period_line_out_kind_check" CHECK ("billing_period_line"."out_kind" is null or "billing_period_line"."out_kind" in ('RETURN', 'LOSS', 'BUY_BACK', 'TRANSFER')),
	CONSTRAINT "billing_period_line_shape_check" CHECK (("billing_period_line"."kind" = 'RENT' and "billing_period_line"."item_id" is not null and "billing_period_line"."quantity" > 0 and "billing_period_line"."from_date" <= "billing_period_line"."to_date" and "billing_period_line"."charged_days" = "billing_period_line"."calendar_days" - "billing_period_line"."holiday_days" and "billing_period_line"."charged_days" >= 0 and "billing_period_line"."daily_price" >= 0 and "billing_period_line"."amount" >= 0) or ("billing_period_line"."kind" = 'MINIMUM' and "billing_period_line"."item_id" is not null and "billing_period_line"."quantity" > 0 and "billing_period_line"."from_date" is null and "billing_period_line"."to_date" is null and "billing_period_line"."charged_days" > 0 and "billing_period_line"."daily_price" >= 0 and "billing_period_line"."amount" >= 0) or ("billing_period_line"."kind" = 'ADJUSTMENT' and "billing_period_line"."item_id" is null and "billing_period_line"."adjustment_id" is not null and "billing_period_line"."ref_month" is not null and "billing_period_line"."amount" <> 0))
);
--> statement-breakpoint
CREATE TABLE "rental_holiday" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_holiday_name_check" CHECK (length(btrim("rental_holiday"."name")) between 1 and 100),
	CONSTRAINT "rental_holiday_range_check" CHECK ("rental_holiday"."end_date" >= "rental_holiday"."start_date" and "rental_holiday"."end_date" - "rental_holiday"."start_date" <= 30)
);
--> statement-breakpoint
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_action_check";--> statement-breakpoint
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_document_type_check";--> statement-breakpoint
ALTER TABLE "billing_adjustment" ADD CONSTRAINT "billing_adjustment_contract_id_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_adjustment" ADD CONSTRAINT "billing_adjustment_closed_period_id_billing_period_id_fk" FOREIGN KEY ("closed_period_id") REFERENCES "public"."billing_period"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_adjustment" ADD CONSTRAINT "billing_adjustment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_adjustment" ADD CONSTRAINT "billing_adjustment_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period" ADD CONSTRAINT "billing_period_contract_id_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period" ADD CONSTRAINT "billing_period_revision_id_contract_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."contract_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period" ADD CONSTRAINT "billing_period_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_freight" ADD CONSTRAINT "billing_period_freight_period_id_billing_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."billing_period"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_freight" ADD CONSTRAINT "billing_period_freight_delivery_note_id_delivery_note_id_fk" FOREIGN KEY ("delivery_note_id") REFERENCES "public"."delivery_note"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_line" ADD CONSTRAINT "billing_period_line_period_id_billing_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."billing_period"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_line" ADD CONSTRAINT "billing_period_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_holiday" ADD CONSTRAINT "rental_holiday_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_holiday" ADD CONSTRAINT "rental_holiday_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_adjustment_contract_idx" ON "billing_adjustment" USING btree ("contract_id","month");--> statement-breakpoint
CREATE INDEX "billing_period_end_idx" ON "billing_period" USING btree ("contract_id","period_end");--> statement-breakpoint
CREATE INDEX "rental_holiday_start_idx" ON "rental_holiday" USING btree ("start_date");--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_action_check" CHECK ("activity_log"."action" in ('CREATE', 'UPDATE', 'SUBMIT', 'APPROVE', 'POST', 'RETURN', 'CANCEL', 'CLOSE', 'DELETE_DRAFT', 'DELETE', 'SIGN_IN', 'START', 'REJECT', 'SEND', 'CLOSE_PERIOD'));--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_document_type_check" CHECK ("activity_log"."document_type" in ('PURCHASE_ORDER', 'GOODS_RECEIPT', 'REPAIR_ORDER', 'STOCKTAKE', 'STOCK_ADJUSTMENT', 'OPENING_BALANCE', 'ITEM', 'ITEM_GROUP', 'KIT', 'SUPPLIER', 'CUSTOMER', 'SITE', 'LOCATION', 'USER', 'SCRAP_PRICE', 'COMPANY_PROFILE', 'CONTRACT', 'CONTRACT_AMENDMENT', 'DELIVERY_NOTE', 'RETURN_NOTE', 'COMPENSATION_NOTE', 'SITE_TRANSFER', 'BUY_BACK', 'BILLING_PERIOD', 'BILLING_ADJUSTMENT', 'RENTAL_HOLIDAY'));--> statement-breakpoint
-- Hand-written (rental-billing design D2, D11): two holidays never share a
-- day. A range-only exclusion constraint needs no btree_gist.
ALTER TABLE "rental_holiday" ADD CONSTRAINT "rental_holiday_no_overlap"
  EXCLUDE USING gist (daterange("start_date", "end_date", '[]') WITH &&);
--> statement-breakpoint
-- A closed period never changes (0.2 #22): the three tables are append-only
-- (APPEND_ONLY_TABLES). Lines and freight are inserted only by the
-- transaction that created the period (created_xact, not a time). TRUNCATE
-- passes on test databases like the ledger does.
CREATE FUNCTION "billing_period_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_xact xid8;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    IF "inventory_truncate_allowed"(
      current_database(),
      current_setting('inventory.allow_truncate', true)
    ) THEN
      RETURN NULL;
    END IF;
    RAISE EXCEPTION 'Kỳ tiền thuê đã chốt, không xóa được'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_TABLE_NAME = 'billing_period' OR TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Kỳ tiền thuê đã chốt, không sửa hay xóa được'
      USING ERRCODE = 'P0001';
  END IF;
  SELECT created_xact INTO parent_xact FROM "billing_period" WHERE id = NEW.period_id;
  IF parent_xact IS DISTINCT FROM pg_current_xact_id() THEN
    RAISE EXCEPTION 'Kỳ tiền thuê đã chốt, không thêm dòng được'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "billing_period_no_update_delete"
BEFORE UPDATE OR DELETE ON "billing_period"
FOR EACH ROW EXECUTE FUNCTION "billing_period_append_only"();
--> statement-breakpoint
CREATE TRIGGER "billing_period_no_truncate"
BEFORE TRUNCATE ON "billing_period"
FOR EACH STATEMENT EXECUTE FUNCTION "billing_period_append_only"();
--> statement-breakpoint
CREATE TRIGGER "billing_period_line_frozen"
BEFORE INSERT OR UPDATE OR DELETE ON "billing_period_line"
FOR EACH ROW EXECUTE FUNCTION "billing_period_append_only"();
--> statement-breakpoint
CREATE TRIGGER "billing_period_line_no_truncate"
BEFORE TRUNCATE ON "billing_period_line"
FOR EACH STATEMENT EXECUTE FUNCTION "billing_period_append_only"();
--> statement-breakpoint
CREATE TRIGGER "billing_period_freight_frozen"
BEFORE INSERT OR UPDATE OR DELETE ON "billing_period_freight"
FOR EACH ROW EXECUTE FUNCTION "billing_period_append_only"();
--> statement-breakpoint
CREATE TRIGGER "billing_period_freight_no_truncate"
BEFORE TRUNCATE ON "billing_period_freight"
FOR EACH STATEMENT EXECUTE FUNCTION "billing_period_append_only"();
--> statement-breakpoint
-- An adjustment lives in an open period. It cannot be written into a closed
-- one, and freezes once its period is closed: only the closing transaction
-- may set closed_period_id, and nothing changes after that.
CREATE FUNCTION "billing_adjustment_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  period_xact xid8;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.closed_period_id IS NOT NULL THEN
    RAISE EXCEPTION 'Kỳ đã chốt, dòng điều chỉnh không sửa hay xóa được'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.closed_period_id IS NOT NULL THEN
    SELECT created_xact INTO period_xact FROM "billing_period"
      WHERE id = NEW.closed_period_id
        AND contract_id = OLD.contract_id AND month = OLD.month;
    IF period_xact IS DISTINCT FROM pg_current_xact_id()
       OR NEW.contract_id <> OLD.contract_id OR NEW.month <> OLD.month
       OR NEW.ref_month <> OLD.ref_month OR NEW.amount <> OLD.amount
       OR NEW.reason <> OLD.reason THEN
      RAISE EXCEPTION 'Chỉ lần chốt kỳ mới khóa được dòng điều chỉnh'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "billing_period"
    WHERE contract_id = COALESCE(NEW.contract_id, OLD.contract_id)
      AND month = COALESCE(NEW.month, OLD.month)
  ) OR (TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM "billing_period"
    WHERE contract_id = OLD.contract_id AND month = OLD.month
  )) THEN
    RAISE EXCEPTION 'Kỳ đã chốt, không ghi dòng điều chỉnh vào kỳ này được'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "billing_adjustment_guard_change"
BEFORE INSERT OR UPDATE OR DELETE ON "billing_adjustment"
FOR EACH ROW EXECUTE FUNCTION "billing_adjustment_guard"();
