CREATE TABLE "delivery_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"contract_id" uuid NOT NULL,
	"batch_no" integer NOT NULL,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"source_location_id" uuid NOT NULL,
	"site_location_id" uuid,
	"planned_date" date,
	"company_truck" boolean DEFAULT false NOT NULL,
	"freight_amount" bigint,
	"vehicle_plate" text,
	"note" text,
	"over_contract_confirmed" boolean DEFAULT false NOT NULL,
	"picking_by" text,
	"picking_started_at" timestamp with time zone,
	"returned_reason" text,
	"cancelled_reason" text,
	"client_draft_id" uuid,
	"posting_id" uuid,
	"business_date" date,
	"departed_at" timestamp with time zone,
	"contract_revision_id" uuid,
	"posted_by" text,
	"posted_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_note_code_unique" UNIQUE("code"),
	CONSTRAINT "delivery_note_client_draft_id_unique" UNIQUE("client_draft_id"),
	CONSTRAINT "delivery_note_batch_unique" UNIQUE("contract_id","batch_no"),
	CONSTRAINT "delivery_note_status_check" CHECK ("delivery_note"."status" in ('PLANNED', 'PICKING', 'POSTED', 'CANCELLED')),
	CONSTRAINT "delivery_note_posted_check" CHECK (("delivery_note"."status" = 'POSTED') = ("delivery_note"."business_date" is not null and "delivery_note"."posting_id" is not null and "delivery_note"."client_draft_id" is not null and "delivery_note"."posted_by" is not null and "delivery_note"."posted_at" is not null and "delivery_note"."contract_revision_id" is not null)),
	CONSTRAINT "delivery_note_picking_check" CHECK ("delivery_note"."status" <> 'PICKING' or ("delivery_note"."picking_by" is not null and "delivery_note"."picking_started_at" is not null)),
	CONSTRAINT "delivery_note_freight_check" CHECK ("delivery_note"."freight_amount" is null or ("delivery_note"."freight_amount" >= 0 and "delivery_note"."company_truck")),
	CONSTRAINT "delivery_note_batch_check" CHECK ("delivery_note"."batch_no" > 0),
	CONSTRAINT "delivery_note_text_check" CHECK (("delivery_note"."vehicle_plate" is null or length("delivery_note"."vehicle_plate") between 1 and 20) and ("delivery_note"."note" is null or length("delivery_note"."note") between 1 and 500) and ("delivery_note"."returned_reason" is null or length("delivery_note"."returned_reason") between 1 and 500) and ("delivery_note"."cancelled_reason" is null or length("delivery_note"."cancelled_reason") between 1 and 500))
);
--> statement-breakpoint
CREATE TABLE "delivery_note_kit" (
	"note_id" uuid NOT NULL,
	"kit_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "delivery_note_kit_note_id_kit_id_pk" PRIMARY KEY("note_id","kit_id"),
	CONSTRAINT "delivery_note_kit_quantity_check" CHECK ("delivery_note_kit"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "delivery_note_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"condition" text,
	"pricing_unit" text,
	"requested_quantity" numeric(14, 3) NOT NULL,
	"unit_price" bigint,
	CONSTRAINT "delivery_note_line_no_unique" UNIQUE("note_id","line_no"),
	CONSTRAINT "delivery_note_line_shape_check" CHECK (("delivery_note_line"."condition" is null and "delivery_note_line"."pricing_unit" is null and "delivery_note_line"."unit_price" is null) or ("delivery_note_line"."condition" in ('NEW', 'GOOD', 'SCRAP') and "delivery_note_line"."pricing_unit" in ('ITEM', 'KG') and ("delivery_note_line"."condition" <> 'SCRAP' or "delivery_note_line"."pricing_unit" = 'KG'))),
	CONSTRAINT "delivery_note_line_quantity_check" CHECK ("delivery_note_line"."requested_quantity" > 0 and ("delivery_note_line"."unit_price" is null or "delivery_note_line"."unit_price" >= 0))
);
--> statement-breakpoint
CREATE TABLE "delivery_note_pick" (
	"line_id" uuid NOT NULL,
	"condition" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"weighed_kg" numeric(14, 3),
	"pieces_estimated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "delivery_note_pick_line_id_condition_pk" PRIMARY KEY("line_id","condition"),
	CONSTRAINT "delivery_note_pick_condition_check" CHECK ("delivery_note_pick"."condition" in ('NEW', 'GOOD', 'SCRAP')),
	CONSTRAINT "delivery_note_pick_quantity_check" CHECK ("delivery_note_pick"."quantity" > 0 and ("delivery_note_pick"."weighed_kg" is null or "delivery_note_pick"."weighed_kg" > 0) and (not "delivery_note_pick"."pieces_estimated" or "delivery_note_pick"."weighed_kg" is not null))
);
--> statement-breakpoint
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_action_check";--> statement-breakpoint
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_document_type_check";--> statement-breakpoint
ALTER TABLE "delivery_note" ADD CONSTRAINT "delivery_note_contract_id_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_note" ADD CONSTRAINT "delivery_note_source_location_id_location_id_fk" FOREIGN KEY ("source_location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_note" ADD CONSTRAINT "delivery_note_site_location_id_location_id_fk" FOREIGN KEY ("site_location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_note" ADD CONSTRAINT "delivery_note_picking_by_user_id_fk" FOREIGN KEY ("picking_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_note" ADD CONSTRAINT "delivery_note_contract_revision_id_contract_revision_id_fk" FOREIGN KEY ("contract_revision_id") REFERENCES "public"."contract_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_note" ADD CONSTRAINT "delivery_note_posted_by_user_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_note" ADD CONSTRAINT "delivery_note_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_note_kit" ADD CONSTRAINT "delivery_note_kit_note_id_delivery_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."delivery_note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_note_kit" ADD CONSTRAINT "delivery_note_kit_kit_id_kit_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."kit"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_note_line" ADD CONSTRAINT "delivery_note_line_note_id_delivery_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."delivery_note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_note_line" ADD CONSTRAINT "delivery_note_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_note_pick" ADD CONSTRAINT "delivery_note_pick_line_id_delivery_note_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."delivery_note_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_note_contract_idx" ON "delivery_note" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "delivery_note_status_idx" ON "delivery_note" USING btree ("status","planned_date");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_note_line_rental_unique" ON "delivery_note_line" USING btree ("note_id","item_id") WHERE "delivery_note_line"."condition" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_note_line_sale_unique" ON "delivery_note_line" USING btree ("note_id","item_id","condition","pricing_unit") WHERE "delivery_note_line"."condition" is not null;--> statement-breakpoint
CREATE INDEX "delivery_note_line_item_idx" ON "delivery_note_line" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_action_check" CHECK ("activity_log"."action" in ('CREATE', 'UPDATE', 'SUBMIT', 'APPROVE', 'POST', 'RETURN', 'CANCEL', 'CLOSE', 'DELETE_DRAFT', 'DELETE', 'SIGN_IN', 'START'));--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_document_type_check" CHECK ("activity_log"."document_type" in ('PURCHASE_ORDER', 'GOODS_RECEIPT', 'REPAIR_ORDER', 'STOCKTAKE', 'STOCK_ADJUSTMENT', 'OPENING_BALANCE', 'ITEM', 'ITEM_GROUP', 'KIT', 'SUPPLIER', 'CUSTOMER', 'SITE', 'LOCATION', 'USER', 'SCRAP_PRICE', 'COMPANY_PROFILE', 'CONTRACT', 'CONTRACT_AMENDMENT', 'DELIVERY_NOTE'));--> statement-breakpoint
-- Hand-written (deliveries design D10): a posted or cancelled delivery note
-- and every row under it are frozen, even for SQL typed by hand. The check
-- reads OLD.status, so posting itself (PICKING -> POSTED) passes; the picks
-- and sale prices are written before the note turns POSTED.
CREATE FUNCTION "delivery_note_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_status text;
BEGIN
  IF TG_TABLE_NAME = 'delivery_note' THEN
    parent_status := OLD.status;
  ELSIF TG_TABLE_NAME = 'delivery_note_pick' THEN
    SELECT n.status INTO parent_status
      FROM "delivery_note_line" l
      JOIN "delivery_note" n ON n.id = l.note_id
      WHERE l.id = COALESCE(OLD.line_id, NEW.line_id);
  ELSE
    SELECT status INTO parent_status FROM "delivery_note"
      WHERE id = COALESCE(OLD.note_id, NEW.note_id);
  END IF;
  IF parent_status IN ('POSTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Phiếu xuất đã xuất hoặc đã hủy, không sửa hay xóa được'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "delivery_note_frozen_no_change"
BEFORE UPDATE OR DELETE ON "delivery_note"
FOR EACH ROW EXECUTE FUNCTION "delivery_note_frozen"();
--> statement-breakpoint
CREATE TRIGGER "delivery_note_kit_frozen_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "delivery_note_kit"
FOR EACH ROW EXECUTE FUNCTION "delivery_note_frozen"();
--> statement-breakpoint
CREATE TRIGGER "delivery_note_line_frozen_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "delivery_note_line"
FOR EACH ROW EXECUTE FUNCTION "delivery_note_frozen"();
--> statement-breakpoint
CREATE TRIGGER "delivery_note_pick_frozen_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "delivery_note_pick"
FOR EACH ROW EXECUTE FUNCTION "delivery_note_frozen"();
