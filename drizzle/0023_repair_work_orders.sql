CREATE TABLE "repair_order_material" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"amount" bigint,
	CONSTRAINT "repair_order_material_unique" UNIQUE("line_id","item_id"),
	CONSTRAINT "repair_order_material_check" CHECK ("repair_order_material"."quantity" > 0 and coalesce("repair_order_material"."amount", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "repair_order_submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"step" text NOT NULL,
	"draft_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repair_order_submission_draft_id_unique" UNIQUE("draft_id"),
	CONSTRAINT "repair_order_submission_step_check" CHECK ("repair_order_submission"."step" in ('RECEIVE', 'REPORT', 'COUNT'))
);
--> statement-breakpoint
ALTER TABLE "item" DROP CONSTRAINT "item_unit_check";--> statement-breakpoint
ALTER TABLE "item" DROP CONSTRAINT "item_prices_check";--> statement-breakpoint
ALTER TABLE "purchase_order_line" DROP CONSTRAINT "purchase_order_line_unit_check";--> statement-breakpoint
ALTER TABLE "repair_order" DROP CONSTRAINT "repair_order_status_check";--> statement-breakpoint
ALTER TABLE "repair_order" DROP CONSTRAINT "repair_order_posted_check";--> statement-breakpoint
ALTER TABLE "repair_order_line" DROP CONSTRAINT "repair_order_line_quantity_check";--> statement-breakpoint
ALTER TABLE "item" ADD COLUMN "repair_labor_rate" bigint;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "kind" text DEFAULT 'SIMPLE' NOT NULL;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "assigned_by" text;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "received_by" text;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "receive_posting_id" uuid;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "reported_by" text;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "reported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "counted_by" text;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "counted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "returned_by" text;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "return_note" text;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "cancel_posting_id" uuid;--> statement-breakpoint
ALTER TABLE "repair_order_line" ADD COLUMN "labor_rate" bigint;--> statement-breakpoint
ALTER TABLE "repair_order_line" ADD COLUMN "reported_good" numeric(14, 3);--> statement-breakpoint
ALTER TABLE "repair_order_line" ADD COLUMN "reported_scrap" numeric(14, 3);--> statement-breakpoint
ALTER TABLE "repair_order_line" ADD COLUMN "labor_amount" bigint;--> statement-breakpoint
ALTER TABLE "repair_order_line" ADD COLUMN "material_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "repair_order_material" ADD CONSTRAINT "repair_order_material_line_id_repair_order_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."repair_order_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order_material" ADD CONSTRAINT "repair_order_material_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order_submission" ADD CONSTRAINT "repair_order_submission_order_id_repair_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."repair_order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order_submission" ADD CONSTRAINT "repair_order_submission_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repair_order_material_item_idx" ON "repair_order_material" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "repair_order_submission_order_idx" ON "repair_order_submission" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_reported_by_user_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_counted_by_user_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_returned_by_user_id_fk" FOREIGN KEY ("returned_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_unit_check" CHECK ("item"."unit" in ('PIECE', 'BAR', 'BUNDLE', 'BASKET', 'ROLL', 'BOX', 'CARTON', 'METER', 'LITER', 'KG'));--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_prices_check" CHECK (coalesce("item"."daily_rental_price", 0) >= 0 and coalesce("item"."lost_price", 0) >= 0 and coalesce("item"."damage_price", 0) >= 0 and coalesce("item"."repair_labor_rate", 0) >= 0);--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_unit_check" CHECK ("purchase_order_line"."unit" in ('PIECE', 'BAR', 'BUNDLE', 'BASKET', 'ROLL', 'BOX', 'CARTON', 'METER', 'LITER', 'KG'));--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_kind_check" CHECK ("repair_order"."kind" in ('SIMPLE', 'WORK_ORDER'));--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_reason_check" CHECK (("repair_order"."return_note" is null or length("repair_order"."return_note") between 1 and 500) and ("repair_order"."cancel_reason" is null or length("repair_order"."cancel_reason") between 1 and 500) and (("repair_order"."status" = 'CANCELLED') = ("repair_order"."cancel_reason" is not null and "repair_order"."cancelled_by" is not null and "repair_order"."cancelled_at" is not null)));--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_status_check" CHECK (("repair_order"."kind" = 'SIMPLE' and "repair_order"."status" in ('DRAFT', 'POSTED')) or ("repair_order"."kind" = 'WORK_ORDER' and "repair_order"."status" in ('DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_CHECK', 'COUNTED', 'POSTED', 'CANCELLED')));--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_posted_check" CHECK (("repair_order"."status" <> 'POSTED' and "repair_order"."posted_by" is null and "repair_order"."posted_at" is null and "repair_order"."posting_id" is null) or ("repair_order"."status" = 'POSTED' and "repair_order"."posted_by" is not null and "repair_order"."posted_at" is not null and "repair_order"."posting_id" is not null));--> statement-breakpoint
ALTER TABLE "repair_order_line" ADD CONSTRAINT "repair_order_line_work_check" CHECK (coalesce("repair_order_line"."labor_rate", 0) >= 0 and coalesce("repair_order_line"."labor_amount", 0) >= 0 and "repair_order_line"."material_amount" >= 0 and coalesce("repair_order_line"."reported_good", 0) >= 0 and coalesce("repair_order_line"."reported_scrap", 0) >= 0);--> statement-breakpoint
ALTER TABLE "repair_order_line" ADD CONSTRAINT "repair_order_line_quantity_check" CHECK ("repair_order_line"."quantity_taken" > 0 and "repair_order_line"."quantity_good" >= 0 and "repair_order_line"."quantity_scrap" >= 0 and ("repair_order_line"."quantity_good" + "repair_order_line"."quantity_scrap" = "repair_order_line"."quantity_taken" or ("repair_order_line"."quantity_good" = 0 and "repair_order_line"."quantity_scrap" = 0)));--> statement-breakpoint
-- Hand-written (repair-work-orders design D7): a posted or cancelled order
-- is frozen with its lines and supplies, even for SQL typed by hand. The
-- final figures are written before the order turns POSTED in the same
-- transaction, like simple slips.
CREATE OR REPLACE FUNCTION "repair_order_posted_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_status text;
BEGIN
  IF TG_TABLE_NAME = 'repair_order' THEN
    parent_status := OLD.status;
  ELSIF TG_TABLE_NAME = 'repair_order_material' THEN
    SELECT o.status INTO parent_status
      FROM "repair_order_line" l JOIN "repair_order" o ON o.id = l.order_id
      WHERE l.id = COALESCE(OLD.line_id, NEW.line_id);
  ELSE
    SELECT status INTO parent_status FROM "repair_order"
      WHERE id = COALESCE(OLD.order_id, NEW.order_id);
  END IF;
  IF parent_status = 'POSTED' THEN
    RAISE EXCEPTION 'Phiếu đã ghi sổ, không sửa hay xóa được'
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
CREATE TRIGGER "repair_order_material_posted_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "repair_order_material"
FOR EACH ROW EXECUTE FUNCTION "repair_order_posted_frozen"();
--> statement-breakpoint
-- Every phone draft id an order used (design D5) is append-only
-- (APPEND_ONLY_TABLES). TRUNCATE passes on test databases like the ledger.
CREATE FUNCTION "repair_order_submission_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' AND "inventory_truncate_allowed"(
    current_database(),
    current_setting('inventory.allow_truncate', true)
  ) THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'Lượt gửi của lệnh sửa chỉ ghi thêm'
    USING ERRCODE = 'P0001';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "repair_order_submission_no_update_delete"
BEFORE UPDATE OR DELETE ON "repair_order_submission"
FOR EACH ROW EXECUTE FUNCTION "repair_order_submission_append_only"();
--> statement-breakpoint
CREATE TRIGGER "repair_order_submission_no_truncate"
BEFORE TRUNCATE ON "repair_order_submission"
FOR EACH STATEMENT EXECUTE FUNCTION "repair_order_submission_append_only"();
