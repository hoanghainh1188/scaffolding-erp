CREATE TABLE "production_bom" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"labor_rate" bigint NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_bom_item_id_unique" UNIQUE("item_id"),
	CONSTRAINT "production_bom_labor_check" CHECK ("production_bom"."labor_rate" >= 0),
	CONSTRAINT "production_bom_note_check" CHECK ("production_bom"."note" is null or length("production_bom"."note") between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "production_bom_material" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bom_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity_per_unit" numeric(14, 3) NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "production_bom_material_unique" UNIQUE("bom_id","item_id"),
	CONSTRAINT "production_bom_material_quantity_check" CHECK ("production_bom_material"."quantity_per_unit" > 0)
);
--> statement-breakpoint
CREATE TABLE "production_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"workshop_id" uuid NOT NULL,
	"to_location_id" uuid NOT NULL,
	"team" text,
	"note" text,
	"assigned_by" text,
	"assigned_at" timestamp with time zone,
	"received_by" text,
	"received_at" timestamp with time zone,
	"reported_by" text,
	"reported_at" timestamp with time zone,
	"counted_by" text,
	"counted_at" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"approve_note" text,
	"returned_by" text,
	"returned_at" timestamp with time zone,
	"return_note" text,
	"cancelled_by" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"posted_by" text,
	"posted_at" timestamp with time zone,
	"scrap_item_id" uuid,
	"scrap_price_used" bigint,
	"posting_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_order_code_unique" UNIQUE("code"),
	CONSTRAINT "production_order_status_check" CHECK ("production_order"."status" in ('DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_CHECK', 'AWAITING_APPROVAL', 'COUNTED', 'POSTED', 'CANCELLED')),
	CONSTRAINT "production_order_cancelled_check" CHECK (("production_order"."status" = 'CANCELLED') = ("production_order"."cancel_reason" is not null and "production_order"."cancelled_by" is not null and "production_order"."cancelled_at" is not null)),
	CONSTRAINT "production_order_posted_check" CHECK (("production_order"."status" = 'POSTED') = ("production_order"."posted_by" is not null and "production_order"."posted_at" is not null and "production_order"."posting_id" is not null)),
	CONSTRAINT "production_order_text_check" CHECK (("production_order"."team" is null or length("production_order"."team") between 1 and 100) and ("production_order"."note" is null or length("production_order"."note") between 1 and 500) and ("production_order"."approve_note" is null or length("production_order"."approve_note") between 1 and 500) and ("production_order"."return_note" is null or length("production_order"."return_note") between 1 and 500) and ("production_order"."cancel_reason" is null or length("production_order"."cancel_reason") between 1 and 500)),
	CONSTRAINT "production_order_scrap_price_check" CHECK ("production_order"."scrap_price_used" is null or "production_order"."scrap_price_used" > 0)
);
--> statement-breakpoint
CREATE TABLE "production_order_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity_planned" numeric(14, 3) NOT NULL,
	"labor_rate" bigint,
	"reported_finished" numeric(14, 3),
	"reported_offcut_kg" numeric(14, 3),
	"quantity_finished" numeric(14, 3),
	"offcut_kg" numeric(14, 3),
	"labor_amount" bigint,
	"material_amount" bigint,
	"offcut_amount" bigint,
	"finished_amount" bigint,
	CONSTRAINT "production_order_line_item_unique" UNIQUE("order_id","item_id"),
	CONSTRAINT "production_order_line_planned_check" CHECK ("production_order_line"."quantity_planned" > 0 and "production_order_line"."quantity_planned" = trunc("production_order_line"."quantity_planned")),
	CONSTRAINT "production_order_line_figures_check" CHECK (coalesce("production_order_line"."labor_rate", 0) >= 0 and coalesce("production_order_line"."reported_finished", 0) >= 0 and coalesce("production_order_line"."reported_offcut_kg", 0) >= 0 and coalesce("production_order_line"."quantity_finished", 0) >= 0 and coalesce("production_order_line"."offcut_kg", 0) >= 0 and coalesce("production_order_line"."labor_amount", 0) >= 0 and coalesce("production_order_line"."material_amount", 0) >= 0 and coalesce("production_order_line"."offcut_amount", 0) >= 0 and coalesce("production_order_line"."finished_amount", 1) > 0)
);
--> statement-breakpoint
CREATE TABLE "production_order_material" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"norm_per_unit" numeric(14, 3),
	"reported_quantity" numeric(14, 3),
	"quantity" numeric(14, 3),
	"amount" bigint,
	CONSTRAINT "production_order_material_unique" UNIQUE("line_id","item_id"),
	CONSTRAINT "production_order_material_check" CHECK (coalesce("production_order_material"."norm_per_unit", 1) > 0 and coalesce("production_order_material"."reported_quantity", 0) >= 0 and coalesce("production_order_material"."quantity", 0) >= 0 and coalesce("production_order_material"."amount", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "production_order_submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"step" text NOT NULL,
	"draft_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_order_submission_draft_id_unique" UNIQUE("draft_id"),
	CONSTRAINT "production_order_submission_step_check" CHECK ("production_order_submission"."step" in ('RECEIVE', 'REPORT', 'COUNT'))
);
--> statement-breakpoint
CREATE TABLE "production_setting" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"scrap_item_id" uuid,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_setting_single_check" CHECK ("production_setting"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "inventory_ledger" DROP CONSTRAINT "inventory_ledger_movement_check";--> statement-breakpoint
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_document_type_check";--> statement-breakpoint
ALTER TABLE "production_bom" ADD CONSTRAINT "production_bom_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_bom" ADD CONSTRAINT "production_bom_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_bom" ADD CONSTRAINT "production_bom_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_bom_material" ADD CONSTRAINT "production_bom_material_bom_id_production_bom_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."production_bom"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_bom_material" ADD CONSTRAINT "production_bom_material_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_workshop_id_location_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_to_location_id_location_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_reported_by_user_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_counted_by_user_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_returned_by_user_id_fk" FOREIGN KEY ("returned_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_posted_by_user_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_scrap_item_id_item_id_fk" FOREIGN KEY ("scrap_item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_line" ADD CONSTRAINT "production_order_line_order_id_production_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."production_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_line" ADD CONSTRAINT "production_order_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_material" ADD CONSTRAINT "production_order_material_line_id_production_order_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."production_order_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_material" ADD CONSTRAINT "production_order_material_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_submission" ADD CONSTRAINT "production_order_submission_order_id_production_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."production_order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_submission" ADD CONSTRAINT "production_order_submission_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_setting" ADD CONSTRAINT "production_setting_scrap_item_id_item_id_fk" FOREIGN KEY ("scrap_item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_setting" ADD CONSTRAINT "production_setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_bom_material_item_idx" ON "production_bom_material" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "production_order_status_idx" ON "production_order" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "production_order_line_item_idx" ON "production_order_line" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "production_order_material_item_idx" ON "production_order_material" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "production_order_submission_order_idx" ON "production_order_submission" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_movement_check" CHECK (("inventory_ledger"."movement" in ('OPENING', 'PURCHASE_IN', 'REPAIR_IN', 'PRODUCTION_IN', 'DELIVERY_IN', 'RETURN_IN', 'TRANSFER_IN', 'ADJUST_IN') and "inventory_ledger"."quantity" > 0 and "inventory_ledger"."location_id" is not null) or ("inventory_ledger"."movement" in ('REPAIR_OUT', 'PRODUCTION_OUT', 'DELIVERY_OUT', 'RETURN_OUT', 'LOSS_OUT', 'TRANSFER_OUT', 'SALE_OUT', 'ADJUST_OUT') and "inventory_ledger"."quantity" < 0 and "inventory_ledger"."location_id" is not null) or ("inventory_ledger"."movement" = 'REVALUE' and "inventory_ledger"."quantity" = 0 and "inventory_ledger"."location_id" is null));--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_document_type_check" CHECK ("activity_log"."document_type" in ('PURCHASE_ORDER', 'GOODS_RECEIPT', 'REPAIR_ORDER', 'STOCKTAKE', 'STOCK_ADJUSTMENT', 'OPENING_BALANCE', 'ITEM', 'ITEM_GROUP', 'KIT', 'SUPPLIER', 'CUSTOMER', 'SITE', 'LOCATION', 'USER', 'SCRAP_PRICE', 'COMPANY_PROFILE', 'CONTRACT', 'CONTRACT_AMENDMENT', 'DELIVERY_NOTE', 'RETURN_NOTE', 'COMPENSATION_NOTE', 'SITE_TRANSFER', 'BUY_BACK', 'BILLING_PERIOD', 'BILLING_ADJUSTMENT', 'RENTAL_HOLIDAY', 'RECEIPT', 'SUPPLIER_PAYMENT', 'PRODUCTION_ORDER', 'PRODUCTION_BOM'));--> statement-breakpoint
-- Hand-written (production-orders design D9): a posted or cancelled order is
-- frozen with its lines and materials, even for SQL typed by hand. The final
-- figures are written before the order turns POSTED in the same transaction.
CREATE FUNCTION "production_order_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_status text;
BEGIN
  IF TG_TABLE_NAME = 'production_order' THEN
    parent_status := OLD.status;
  ELSIF TG_TABLE_NAME = 'production_order_material' THEN
    SELECT o.status INTO parent_status
      FROM "production_order_line" l
      JOIN "production_order" o ON o.id = l.order_id
      WHERE l.id = COALESCE(OLD.line_id, NEW.line_id);
  ELSE
    SELECT status INTO parent_status FROM "production_order"
      WHERE id = COALESCE(OLD.order_id, NEW.order_id);
  END IF;
  IF parent_status = 'POSTED' THEN
    RAISE EXCEPTION 'Lệnh đã ghi sổ, không sửa hay xóa được'
      USING ERRCODE = 'P0001';
  END IF;
  IF parent_status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Lệnh đã hủy, không sửa hay xóa được'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "production_order_no_change"
BEFORE UPDATE OR DELETE ON "production_order"
FOR EACH ROW EXECUTE FUNCTION "production_order_frozen"();
--> statement-breakpoint
CREATE TRIGGER "production_order_line_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "production_order_line"
FOR EACH ROW EXECUTE FUNCTION "production_order_frozen"();
--> statement-breakpoint
CREATE TRIGGER "production_order_material_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "production_order_material"
FOR EACH ROW EXECUTE FUNCTION "production_order_frozen"();
--> statement-breakpoint
-- Every phone draft id an order used is append-only (APPEND_ONLY_TABLES).
-- TRUNCATE passes on test databases like the ledger.
CREATE FUNCTION "production_order_submission_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' AND "inventory_truncate_allowed"(
    current_database(),
    current_setting('inventory.allow_truncate', true)
  ) THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'Lượt gửi của lệnh sản xuất chỉ ghi thêm'
    USING ERRCODE = 'P0001';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "production_order_submission_no_update_delete"
BEFORE UPDATE OR DELETE ON "production_order_submission"
FOR EACH ROW EXECUTE FUNCTION "production_order_submission_append_only"();
--> statement-breakpoint
CREATE TRIGGER "production_order_submission_no_truncate"
BEFORE TRUNCATE ON "production_order_submission"
FOR EACH STATEMENT EXECUTE FUNCTION "production_order_submission_append_only"();
