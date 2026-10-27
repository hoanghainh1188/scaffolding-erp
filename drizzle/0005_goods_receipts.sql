CREATE TABLE "goods_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"order_id" uuid NOT NULL,
	"trip_no" integer NOT NULL,
	"location_id" uuid NOT NULL,
	"client_draft_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"arrived_at" timestamp with time zone,
	"vehicle" text,
	"scrap_price_id" bigint,
	"scrap_price_per_kg" bigint,
	"posting_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goods_receipt_code_unique" UNIQUE("code"),
	CONSTRAINT "goods_receipt_client_draft_id_unique" UNIQUE("client_draft_id"),
	CONSTRAINT "goods_receipt_trip_unique" UNIQUE("order_id","trip_no"),
	CONSTRAINT "goods_receipt_trip_check" CHECK ("goods_receipt"."trip_no" > 0),
	CONSTRAINT "goods_receipt_scrap_price_check" CHECK (("goods_receipt"."scrap_price_id" is null) = ("goods_receipt"."scrap_price_per_kg" is null))
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_cost" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"label" text NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "goods_receipt_cost_values_check" CHECK ("goods_receipt_cost"."amount" > 0 and length("goods_receipt_cost"."label") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"order_line_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"status" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"weighed_kg" numeric(14, 3),
	"qty_new" numeric(14, 3) DEFAULT '0' NOT NULL,
	"qty_good" numeric(14, 3) DEFAULT '0' NOT NULL,
	"qty_needs_repair" numeric(14, 3) DEFAULT '0' NOT NULL,
	"qty_scrap" numeric(14, 3) DEFAULT '0' NOT NULL,
	"awaits_rest" boolean DEFAULT false NOT NULL,
	CONSTRAINT "goods_receipt_line_order_line_unique" UNIQUE("receipt_id","order_line_id"),
	CONSTRAINT "goods_receipt_line_status_check" CHECK ("goods_receipt_line"."status" in ('COUNTED', 'NOT_IN_TRIP')),
	CONSTRAINT "goods_receipt_line_values_check" CHECK ("goods_receipt_line"."quantity" >= 0 and ("goods_receipt_line"."weighed_kg" is null or "goods_receipt_line"."weighed_kg" > 0) and "goods_receipt_line"."qty_new" >= 0 and "goods_receipt_line"."qty_good" >= 0 and "goods_receipt_line"."qty_needs_repair" >= 0 and "goods_receipt_line"."qty_scrap" >= 0),
	CONSTRAINT "goods_receipt_line_split_check" CHECK ("goods_receipt_line"."qty_new" + "goods_receipt_line"."qty_good" + "goods_receipt_line"."qty_needs_repair" + "goods_receipt_line"."qty_scrap" = "goods_receipt_line"."quantity"),
	CONSTRAINT "goods_receipt_line_state_check" CHECK (("goods_receipt_line"."status" = 'NOT_IN_TRIP' and "goods_receipt_line"."quantity" = 0 and "goods_receipt_line"."weighed_kg" is null) or ("goods_receipt_line"."status" = 'COUNTED' and "goods_receipt_line"."quantity" > 0))
);
--> statement-breakpoint
CREATE TABLE "scrap_price" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scrap_price_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"price_per_kg" bigint NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scrap_price_value_check" CHECK ("scrap_price"."price_per_kg" > 0)
);
--> statement-breakpoint
ALTER TABLE "purchase_order_event" DROP CONSTRAINT "purchase_order_event_kind_check";--> statement-breakpoint
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_order_id_purchase_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_scrap_price_id_scrap_price_id_fk" FOREIGN KEY ("scrap_price_id") REFERENCES "public"."scrap_price"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_cost" ADD CONSTRAINT "goods_receipt_cost_receipt_id_goods_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."goods_receipt"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_receipt_id_goods_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."goods_receipt"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_order_line_id_purchase_order_line_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."purchase_order_line"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrap_price" ADD CONSTRAINT "scrap_price_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goods_receipt_order_idx" ON "goods_receipt" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "goods_receipt_date_idx" ON "goods_receipt" USING btree ("business_date");--> statement-breakpoint
CREATE INDEX "goods_receipt_cost_receipt_idx" ON "goods_receipt_cost" USING btree ("receipt_id","line_no");--> statement-breakpoint
CREATE INDEX "goods_receipt_line_order_line_idx" ON "goods_receipt_line" USING btree ("order_line_id");--> statement-breakpoint
ALTER TABLE "purchase_order_event" ADD CONSTRAINT "purchase_order_event_kind_check" CHECK ("purchase_order_event"."kind" in ('CREATED', 'PLACED', 'UPDATED', 'CANCELLED', 'CLOSED', 'RECEIPT_POSTED', 'BACKORDER_MARKED', 'RECEIVED'));--> statement-breakpoint
-- Hand-written (goods-receipt design D8, D9): the scrap price history is
-- append-only. TRUNCATE passes on test databases like the ledger does.
CREATE FUNCTION "scrap_price_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' AND "inventory_truncate_allowed"(
    current_database(),
    current_setting('inventory.allow_truncate', true)
  ) THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'Giá sắt vụn chỉ ghi thêm'
    USING ERRCODE = 'P0001';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "scrap_price_no_update_delete"
BEFORE UPDATE OR DELETE ON "scrap_price"
FOR EACH ROW EXECUTE FUNCTION "scrap_price_append_only"();
--> statement-breakpoint
CREATE TRIGGER "scrap_price_no_truncate"
BEFORE TRUNCATE ON "scrap_price"
FOR EACH STATEMENT EXECUTE FUNCTION "scrap_price_append_only"();
