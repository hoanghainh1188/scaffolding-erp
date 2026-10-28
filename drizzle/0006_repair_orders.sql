CREATE TABLE "repair_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"repair_date" date NOT NULL,
	"repaired_by" text,
	"note" text,
	"from_location_id" uuid NOT NULL,
	"to_location_id" uuid NOT NULL,
	"scrap_price_used" bigint,
	"confirmed_note" text,
	"posting_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_by" text,
	"posted_at" timestamp with time zone,
	CONSTRAINT "repair_order_code_unique" UNIQUE("code"),
	CONSTRAINT "repair_order_status_check" CHECK ("repair_order"."status" in ('DRAFT', 'POSTED')),
	CONSTRAINT "repair_order_posted_check" CHECK (("repair_order"."status" = 'DRAFT' and "repair_order"."posted_by" is null and "repair_order"."posted_at" is null and "repair_order"."posting_id" is null) or ("repair_order"."status" = 'POSTED' and "repair_order"."posted_by" is not null and "repair_order"."posted_at" is not null and "repair_order"."posting_id" is not null)),
	CONSTRAINT "repair_order_text_check" CHECK (("repair_order"."repaired_by" is null or length("repair_order"."repaired_by") between 1 and 100) and ("repair_order"."note" is null or length("repair_order"."note") between 1 and 500)),
	CONSTRAINT "repair_order_scrap_price_check" CHECK ("repair_order"."scrap_price_used" is null or "repair_order"."scrap_price_used" > 0)
);
--> statement-breakpoint
CREATE TABLE "repair_order_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity_taken" numeric(14, 3) NOT NULL,
	"quantity_good" numeric(14, 3) NOT NULL,
	"quantity_scrap" numeric(14, 3) NOT NULL,
	"repair_cost" bigint NOT NULL,
	"loss_amount" bigint,
	CONSTRAINT "repair_order_line_item_unique" UNIQUE("order_id","item_id"),
	CONSTRAINT "repair_order_line_quantity_check" CHECK ("repair_order_line"."quantity_taken" > 0 and "repair_order_line"."quantity_good" >= 0 and "repair_order_line"."quantity_scrap" >= 0 and "repair_order_line"."quantity_good" + "repair_order_line"."quantity_scrap" = "repair_order_line"."quantity_taken"),
	CONSTRAINT "repair_order_line_cost_check" CHECK ("repair_order_line"."repair_cost" >= 0 and ("repair_order_line"."repair_cost" = 0 or "repair_order_line"."quantity_good" > 0)),
	CONSTRAINT "repair_order_line_loss_check" CHECK ("repair_order_line"."loss_amount" is null or ("repair_order_line"."loss_amount" >= 0 and ("repair_order_line"."loss_amount" = 0 or "repair_order_line"."quantity_good" = 0)))
);
--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_from_location_id_location_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_to_location_id_location_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_posted_by_user_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order_line" ADD CONSTRAINT "repair_order_line_order_id_repair_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."repair_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order_line" ADD CONSTRAINT "repair_order_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repair_order_status_idx" ON "repair_order" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "repair_order_line_item_idx" ON "repair_order_line" USING btree ("item_id");--> statement-breakpoint
-- Hand-written (simple-repair design D8): a posted repair slip and its
-- lines are frozen, even for SQL typed by hand. Drafts change freely; the
-- lines are written before the slip turns POSTED in the same transaction.
CREATE FUNCTION "repair_order_posted_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_status text;
BEGIN
  IF TG_TABLE_NAME = 'repair_order' THEN
    parent_status := OLD.status;
  ELSE
    SELECT status INTO parent_status FROM "repair_order"
      WHERE id = COALESCE(OLD.order_id, NEW.order_id);
  END IF;
  IF parent_status = 'POSTED' THEN
    RAISE EXCEPTION 'Phiếu đã ghi sổ, không sửa hay xóa được'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "repair_order_posted_no_change"
BEFORE UPDATE OR DELETE ON "repair_order"
FOR EACH ROW EXECUTE FUNCTION "repair_order_posted_frozen"();
--> statement-breakpoint
CREATE TRIGGER "repair_order_line_posted_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "repair_order_line"
FOR EACH ROW EXECUTE FUNCTION "repair_order_posted_frozen"();
