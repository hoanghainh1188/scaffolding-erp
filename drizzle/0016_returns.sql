CREATE TABLE "compensation_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"return_note_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"discount_amount" bigint DEFAULT 0 NOT NULL,
	"discount_reason" text,
	"approval_reason" text,
	"rejected_reason" text,
	"amount_due" bigint,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"approved_date" date,
	"due_date" date,
	"rejected_by" text,
	"rejected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_xact" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "compensation_note_code_unique" UNIQUE("code"),
	CONSTRAINT "compensation_note_return_note_id_unique" UNIQUE("return_note_id"),
	CONSTRAINT "compensation_note_status_check" CHECK ("compensation_note"."status" in ('PENDING', 'APPROVED', 'REJECTED')),
	CONSTRAINT "compensation_note_approved_check" CHECK (("compensation_note"."status" = 'APPROVED') = ("compensation_note"."amount_due" is not null and "compensation_note"."approved_by" is not null and "compensation_note"."approved_at" is not null and "compensation_note"."approved_date" is not null and "compensation_note"."due_date" is not null)),
	CONSTRAINT "compensation_note_rejected_check" CHECK (("compensation_note"."status" = 'REJECTED') = ("compensation_note"."rejected_reason" is not null and "compensation_note"."rejected_by" is not null and "compensation_note"."rejected_at" is not null)),
	CONSTRAINT "compensation_note_discount_check" CHECK ("compensation_note"."discount_amount" >= 0 and ("compensation_note"."discount_amount" = 0 or "compensation_note"."discount_reason" is not null) and ("compensation_note"."amount_due" is null or "compensation_note"."amount_due" >= 0)),
	CONSTRAINT "compensation_note_text_check" CHECK (("compensation_note"."discount_reason" is null or length("compensation_note"."discount_reason") between 1 and 500) and ("compensation_note"."approval_reason" is null or length("compensation_note"."approval_reason") between 1 and 500) and ("compensation_note"."rejected_reason" is null or length("compensation_note"."rejected_reason") between 1 and 500))
);
--> statement-breakpoint
CREATE TABLE "compensation_note_line" (
	"note_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" bigint,
	"contract_price" bigint,
	CONSTRAINT "compensation_note_line_note_id_item_id_kind_pk" PRIMARY KEY("note_id","item_id","kind"),
	CONSTRAINT "compensation_note_line_kind_check" CHECK ("compensation_note_line"."kind" in ('DAMAGED', 'SCRAPPED', 'LOST')),
	CONSTRAINT "compensation_note_line_amount_check" CHECK ("compensation_note_line"."quantity" > 0 and ("compensation_note_line"."unit_price" is null or "compensation_note_line"."unit_price" >= 0) and ("compensation_note_line"."contract_price" is null or "compensation_note_line"."contract_price" >= 0))
);
--> statement-breakpoint
CREATE TABLE "return_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"contract_id" uuid NOT NULL,
	"site_location_id" uuid NOT NULL,
	"yard_location_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"vehicle_plate" text,
	"note" text,
	"client_draft_id" uuid NOT NULL,
	"posting_id" uuid NOT NULL,
	"saved_on_device_at" timestamp with time zone,
	"posted_by" text NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"created_xact" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "return_note_code_unique" UNIQUE("code"),
	CONSTRAINT "return_note_client_draft_id_unique" UNIQUE("client_draft_id"),
	CONSTRAINT "return_note_text_check" CHECK (("return_note"."vehicle_plate" is null or length("return_note"."vehicle_plate") between 1 and 20) and ("return_note"."note" is null or length("return_note"."note") between 1 and 500)),
	CONSTRAINT "return_note_location_check" CHECK ("return_note"."site_location_id" <> "return_note"."yard_location_id")
);
--> statement-breakpoint
CREATE TABLE "return_note_line" (
	"note_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"good_quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"repair_quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"scrap_quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"lost_quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	CONSTRAINT "return_note_line_note_id_item_id_pk" PRIMARY KEY("note_id","item_id"),
	CONSTRAINT "return_note_line_no_unique" UNIQUE("note_id","line_no"),
	CONSTRAINT "return_note_line_quantity_check" CHECK ("return_note_line"."good_quantity" >= 0 and "return_note_line"."repair_quantity" >= 0 and "return_note_line"."scrap_quantity" >= 0 and "return_note_line"."lost_quantity" >= 0 and "return_note_line"."good_quantity" + "return_note_line"."repair_quantity" + "return_note_line"."scrap_quantity" + "return_note_line"."lost_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "return_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_draft_id" uuid NOT NULL,
	"client_photo_id" uuid NOT NULL,
	"return_note_id" uuid,
	"position" smallint DEFAULT 0 NOT NULL,
	"caption" text,
	"content" "bytea" NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_photo_client_unique" UNIQUE("client_draft_id","client_photo_id"),
	CONSTRAINT "return_photo_shape_check" CHECK ("return_photo"."byte_size" > 0 and "return_photo"."width" > 0 and "return_photo"."height" > 0 and "return_photo"."position" >= 0 and ("return_photo"."caption" is null or length("return_photo"."caption") between 1 and 100))
);
--> statement-breakpoint
ALTER TABLE "inventory_ledger" DROP CONSTRAINT "inventory_ledger_movement_check";--> statement-breakpoint
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_action_check";--> statement-breakpoint
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_document_type_check";--> statement-breakpoint
ALTER TABLE "compensation_note" ADD CONSTRAINT "compensation_note_return_note_id_return_note_id_fk" FOREIGN KEY ("return_note_id") REFERENCES "public"."return_note"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_note" ADD CONSTRAINT "compensation_note_contract_id_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_note" ADD CONSTRAINT "compensation_note_revision_id_contract_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."contract_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_note" ADD CONSTRAINT "compensation_note_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_note" ADD CONSTRAINT "compensation_note_rejected_by_user_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_note_line" ADD CONSTRAINT "compensation_note_line_note_id_compensation_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."compensation_note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_note_line" ADD CONSTRAINT "compensation_note_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_note" ADD CONSTRAINT "return_note_contract_id_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_note" ADD CONSTRAINT "return_note_site_location_id_location_id_fk" FOREIGN KEY ("site_location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_note" ADD CONSTRAINT "return_note_yard_location_id_location_id_fk" FOREIGN KEY ("yard_location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_note" ADD CONSTRAINT "return_note_posted_by_user_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_note_line" ADD CONSTRAINT "return_note_line_note_id_return_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."return_note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_note_line" ADD CONSTRAINT "return_note_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_photo" ADD CONSTRAINT "return_photo_return_note_id_return_note_id_fk" FOREIGN KEY ("return_note_id") REFERENCES "public"."return_note"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_photo" ADD CONSTRAINT "return_photo_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compensation_note_contract_idx" ON "compensation_note" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "compensation_note_status_idx" ON "compensation_note" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "return_note_contract_idx" ON "return_note" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "return_note_date_idx" ON "return_note" USING btree ("business_date");--> statement-breakpoint
CREATE INDEX "return_note_line_item_idx" ON "return_note_line" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "return_photo_note_idx" ON "return_photo" USING btree ("return_note_id");--> statement-breakpoint
CREATE INDEX "return_photo_draft_idx" ON "return_photo" USING btree ("client_draft_id");--> statement-breakpoint
CREATE INDEX "return_photo_orphan_idx" ON "return_photo" USING btree ("uploaded_at") WHERE "return_photo"."return_note_id" is null;--> statement-breakpoint
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_movement_check" CHECK (("inventory_ledger"."movement" in ('OPENING', 'PURCHASE_IN', 'REPAIR_IN', 'DELIVERY_IN', 'RETURN_IN', 'TRANSFER_IN', 'ADJUST_IN') and "inventory_ledger"."quantity" > 0 and "inventory_ledger"."location_id" is not null) or ("inventory_ledger"."movement" in ('REPAIR_OUT', 'DELIVERY_OUT', 'RETURN_OUT', 'LOSS_OUT', 'TRANSFER_OUT', 'SALE_OUT', 'ADJUST_OUT') and "inventory_ledger"."quantity" < 0 and "inventory_ledger"."location_id" is not null) or ("inventory_ledger"."movement" = 'REVALUE' and "inventory_ledger"."quantity" = 0 and "inventory_ledger"."location_id" is null));--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_action_check" CHECK ("activity_log"."action" in ('CREATE', 'UPDATE', 'SUBMIT', 'APPROVE', 'POST', 'RETURN', 'CANCEL', 'CLOSE', 'DELETE_DRAFT', 'DELETE', 'SIGN_IN', 'START', 'REJECT'));--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_document_type_check" CHECK ("activity_log"."document_type" in ('PURCHASE_ORDER', 'GOODS_RECEIPT', 'REPAIR_ORDER', 'STOCKTAKE', 'STOCK_ADJUSTMENT', 'OPENING_BALANCE', 'ITEM', 'ITEM_GROUP', 'KIT', 'SUPPLIER', 'CUSTOMER', 'SITE', 'LOCATION', 'USER', 'SCRAP_PRICE', 'COMPANY_PROFILE', 'CONTRACT', 'CONTRACT_AMENDMENT', 'DELIVERY_NOTE', 'RETURN_NOTE', 'COMPENSATION_NOTE'));--> statement-breakpoint
-- Hand-written (returns-and-compensation design D3, D9): a return note exists
-- only once posted and never changes. Child rows are checked against the
-- transaction that created the parent (created_xact), not against a time:
-- postReturn takes `now` from the caller in tests.
CREATE FUNCTION "return_note_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_xact xid8;
BEGIN
  IF TG_TABLE_NAME = 'return_note' OR TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Phiếu thu hồi đã ghi sổ, không sửa hay xóa được'
      USING ERRCODE = 'P0001';
  END IF;
  SELECT created_xact INTO parent_xact FROM "return_note" WHERE id = NEW.note_id;
  IF parent_xact IS DISTINCT FROM pg_current_xact_id() THEN
    RAISE EXCEPTION 'Phiếu thu hồi đã ghi sổ, không thêm dòng được'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "return_note_frozen_no_change"
BEFORE UPDATE OR DELETE ON "return_note"
FOR EACH ROW EXECUTE FUNCTION "return_note_frozen"();
--> statement-breakpoint
CREATE TRIGGER "return_note_line_frozen_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "return_note_line"
FOR EACH ROW EXECUTE FUNCTION "return_note_frozen"();
--> statement-breakpoint
-- A compensation note changes only while pending (prices, discount, then
-- approve or reject); it is never deleted. Lines are inserted only with the
-- note, and only their unit price changes while pending.
CREATE FUNCTION "compensation_note_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_status text;
  parent_xact xid8;
BEGIN
  IF TG_TABLE_NAME = 'compensation_note' THEN
    IF TG_OP = 'DELETE' OR OLD.status <> 'PENDING' THEN
      RAISE EXCEPTION 'Phiếu đền bù đã duyệt hoặc đã từ chối, không sửa được'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  SELECT status, created_xact INTO parent_status, parent_xact
    FROM "compensation_note" WHERE id = COALESCE(NEW.note_id, OLD.note_id);
  IF TG_OP = 'INSERT' THEN
    IF parent_xact IS DISTINCT FROM pg_current_xact_id() THEN
      RAISE EXCEPTION 'Phiếu đền bù đã tạo, không thêm dòng được'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' OR parent_status <> 'PENDING'
     OR NEW.note_id <> OLD.note_id OR NEW.item_id <> OLD.item_id
     OR NEW.kind <> OLD.kind OR NEW.quantity <> OLD.quantity
     OR NEW.contract_price IS DISTINCT FROM OLD.contract_price THEN
    RAISE EXCEPTION 'Phiếu đền bù đã duyệt hoặc đã từ chối, không sửa được'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "compensation_note_frozen_no_change"
BEFORE UPDATE OR DELETE ON "compensation_note"
FOR EACH ROW EXECUTE FUNCTION "compensation_note_frozen"();
--> statement-breakpoint
CREATE TRIGGER "compensation_note_line_frozen_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "compensation_note_line"
FOR EACH ROW EXECUTE FUNCTION "compensation_note_frozen"();
--> statement-breakpoint
-- Photos of a posted return note are append-only (design D4). A draft photo
-- may be deleted (clean-up) and is attached once, by the transaction that
-- creates the note.
CREATE FUNCTION "return_photo_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_xact xid8;
BEGIN
  IF OLD.return_note_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ảnh của phiếu thu hồi đã ghi sổ không xóa hay thay được'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.content <> OLD.content OR NEW.client_draft_id <> OLD.client_draft_id
     OR NEW.uploaded_by <> OLD.uploaded_by THEN
    RAISE EXCEPTION 'Ảnh đã gửi không thay được'
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.return_note_id IS NOT NULL THEN
    SELECT created_xact INTO parent_xact FROM "return_note"
      WHERE id = NEW.return_note_id;
    IF parent_xact IS DISTINCT FROM pg_current_xact_id() THEN
      RAISE EXCEPTION 'Phiếu thu hồi đã ghi sổ, không thêm ảnh được'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "return_photo_frozen_no_change"
BEFORE UPDATE OR DELETE ON "return_photo"
FOR EACH ROW EXECUTE FUNCTION "return_photo_frozen"();
