CREATE TABLE "document_counter" (
	"prefix" text NOT NULL,
	"year" integer NOT NULL,
	"last_number" integer NOT NULL,
	CONSTRAINT "document_counter_prefix_year_pk" PRIMARY KEY("prefix","year")
);
--> statement-breakpoint
CREATE TABLE "inventory_cost" (
	"item_id" uuid NOT NULL,
	"condition" text NOT NULL,
	"avg_cost" bigint,
	"pool_quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"last_business_date" date,
	"last_ledger_id" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_cost_item_id_condition_pk" PRIMARY KEY("item_id","condition"),
	CONSTRAINT "inventory_cost_condition_check" CHECK ("inventory_cost"."condition" in ('NEW', 'GOOD', 'NEEDS_REPAIR', 'SCRAP')),
	CONSTRAINT "inventory_cost_values_check" CHECK (coalesce("inventory_cost"."avg_cost", 0) >= 0 and "inventory_cost"."pool_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_ledger" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inventory_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"posting_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"item_id" uuid NOT NULL,
	"condition" text NOT NULL,
	"location_id" uuid NOT NULL,
	"movement" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" bigint NOT NULL,
	"amount" bigint NOT NULL,
	"avg_cost_after" bigint NOT NULL,
	"pool_quantity_after" numeric(14, 3) NOT NULL,
	"weighed_kg" numeric(14, 3),
	"document_type" text NOT NULL,
	"document_id" uuid,
	"document_code" text NOT NULL,
	"description" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_ledger_condition_check" CHECK ("inventory_ledger"."condition" in ('NEW', 'GOOD', 'NEEDS_REPAIR', 'SCRAP')),
	CONSTRAINT "inventory_ledger_movement_check" CHECK (("inventory_ledger"."movement" in ('OPENING', 'PURCHASE_IN', 'REPAIR_IN', 'DELIVERY_IN', 'RETURN_IN', 'TRANSFER_IN', 'ADJUST_IN') and "inventory_ledger"."quantity" > 0) or ("inventory_ledger"."movement" in ('REPAIR_OUT', 'DELIVERY_OUT', 'RETURN_OUT', 'TRANSFER_OUT', 'SALE_OUT', 'ADJUST_OUT') and "inventory_ledger"."quantity" < 0)),
	CONSTRAINT "inventory_ledger_cost_check" CHECK ("inventory_ledger"."unit_cost" >= 0 and "inventory_ledger"."avg_cost_after" >= 0 and "inventory_ledger"."pool_quantity_after" >= 0 and coalesce("inventory_ledger"."weighed_kg", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_adjustment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"reason" text NOT NULL,
	"related_document_code" text,
	"opening_date" date,
	"returned_reason" text,
	"posting_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"returned_by" text,
	"returned_at" timestamp with time zone,
	CONSTRAINT "stock_adjustment_code_unique" UNIQUE("code"),
	CONSTRAINT "stock_adjustment_kind_check" CHECK ("stock_adjustment"."kind" in ('ADJUSTMENT', 'OPENING')),
	CONSTRAINT "stock_adjustment_status_check" CHECK ("stock_adjustment"."status" in ('DRAFT', 'PENDING_APPROVAL', 'DONE')),
	CONSTRAINT "stock_adjustment_opening_check" CHECK (("stock_adjustment"."kind" = 'OPENING') = ("stock_adjustment"."opening_date" is not null)),
	CONSTRAINT "stock_adjustment_done_check" CHECK (("stock_adjustment"."status" = 'DONE') = ("stock_adjustment"."posting_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "stock_adjustment_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adjustment_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"line_type" text NOT NULL,
	"item_id" uuid NOT NULL,
	"condition" text NOT NULL,
	"to_condition" text,
	"location_id" uuid NOT NULL,
	"to_location_id" uuid,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" bigint,
	CONSTRAINT "stock_adjustment_line_type_check" CHECK ("stock_adjustment_line"."line_type" in ('QUANTITY', 'CONDITION', 'LOCATION', 'OPENING')),
	CONSTRAINT "stock_adjustment_line_condition_check" CHECK ("stock_adjustment_line"."condition" in ('NEW', 'GOOD', 'NEEDS_REPAIR', 'SCRAP') and ("stock_adjustment_line"."to_condition" is null or "stock_adjustment_line"."to_condition" in ('NEW', 'GOOD', 'NEEDS_REPAIR', 'SCRAP'))),
	CONSTRAINT "stock_adjustment_line_shape_check" CHECK (("stock_adjustment_line"."line_type" = 'QUANTITY' and "stock_adjustment_line"."quantity" <> 0 and "stock_adjustment_line"."to_condition" is null and "stock_adjustment_line"."to_location_id" is null)
        or ("stock_adjustment_line"."line_type" = 'CONDITION' and "stock_adjustment_line"."quantity" > 0 and "stock_adjustment_line"."to_condition" is not null and "stock_adjustment_line"."to_condition" <> "stock_adjustment_line"."condition" and "stock_adjustment_line"."to_location_id" is null)
        or ("stock_adjustment_line"."line_type" = 'LOCATION' and "stock_adjustment_line"."quantity" > 0 and "stock_adjustment_line"."to_location_id" is not null and "stock_adjustment_line"."to_location_id" <> "stock_adjustment_line"."location_id" and "stock_adjustment_line"."to_condition" is null)
        or ("stock_adjustment_line"."line_type" = 'OPENING' and "stock_adjustment_line"."quantity" > 0 and "stock_adjustment_line"."unit_cost" is not null and "stock_adjustment_line"."to_condition" is null and "stock_adjustment_line"."to_location_id" is null)),
	CONSTRAINT "stock_adjustment_line_cost_check" CHECK (coalesce("stock_adjustment_line"."unit_cost", 0) >= 0)
);
--> statement-breakpoint
ALTER TABLE "inventory_cost" ADD CONSTRAINT "inventory_cost_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment" ADD CONSTRAINT "stock_adjustment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment" ADD CONSTRAINT "stock_adjustment_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment" ADD CONSTRAINT "stock_adjustment_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment" ADD CONSTRAINT "stock_adjustment_returned_by_user_id_fk" FOREIGN KEY ("returned_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_line" ADD CONSTRAINT "stock_adjustment_line_adjustment_id_stock_adjustment_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."stock_adjustment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_line" ADD CONSTRAINT "stock_adjustment_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_line" ADD CONSTRAINT "stock_adjustment_line_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_line" ADD CONSTRAINT "stock_adjustment_line_to_location_id_location_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_ledger_stock_idx" ON "inventory_ledger" USING btree ("item_id","condition","location_id");--> statement-breakpoint
CREATE INDEX "inventory_ledger_location_idx" ON "inventory_ledger" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "inventory_ledger_card_idx" ON "inventory_ledger" USING btree ("item_id","business_date","id");--> statement-breakpoint
CREATE INDEX "inventory_ledger_document_idx" ON "inventory_ledger" USING btree ("document_type","document_id");--> statement-breakpoint
CREATE INDEX "stock_adjustment_status_idx" ON "stock_adjustment" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "stock_adjustment_line_adjustment_idx" ON "stock_adjustment_line" USING btree ("adjustment_id","line_no");--> statement-breakpoint
-- Hand-written (inventory-ledger design D1): the ledger is append-only.
-- TRUNCATE passes only on a database whose name ends in _test and only when
-- the session set inventory.allow_truncate = 'on' (src/test/inventory.ts).
CREATE FUNCTION "inventory_truncate_allowed"(db_name text, flag text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(flag, '') = 'on' AND db_name LIKE '%\_test'
$$;
--> statement-breakpoint
CREATE FUNCTION "inventory_ledger_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' AND "inventory_truncate_allowed"(
    current_database(),
    current_setting('inventory.allow_truncate', true)
  ) THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'Sổ kho chỉ ghi thêm, sai thì lập phiếu điều chỉnh'
    USING ERRCODE = 'P0001';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "inventory_ledger_no_update_delete"
BEFORE UPDATE OR DELETE ON "inventory_ledger"
FOR EACH ROW EXECUTE FUNCTION "inventory_ledger_append_only"();
--> statement-breakpoint
CREATE TRIGGER "inventory_ledger_no_truncate"
BEFORE TRUNCATE ON "inventory_ledger"
FOR EACH STATEMENT EXECUTE FUNCTION "inventory_ledger_append_only"();
