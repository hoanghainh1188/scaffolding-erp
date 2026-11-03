CREATE TABLE "buy_back_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"contract_id" uuid NOT NULL,
	"site_location_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reason" text NOT NULL,
	"approval_reason" text,
	"rejected_reason" text,
	"amount_due" bigint,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"approved_date" date,
	"due_date" date,
	"posting_id" uuid,
	"rejected_by" text,
	"rejected_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buy_back_note_code_unique" UNIQUE("code"),
	CONSTRAINT "buy_back_note_status_check" CHECK ("buy_back_note"."status" in ('PENDING', 'APPROVED', 'REJECTED')),
	CONSTRAINT "buy_back_note_approved_check" CHECK (("buy_back_note"."status" = 'APPROVED') = ("buy_back_note"."amount_due" is not null and "buy_back_note"."approved_by" is not null and "buy_back_note"."approved_at" is not null and "buy_back_note"."approved_date" is not null and "buy_back_note"."due_date" is not null and "buy_back_note"."posting_id" is not null)),
	CONSTRAINT "buy_back_note_rejected_check" CHECK (("buy_back_note"."status" = 'REJECTED') = ("buy_back_note"."rejected_reason" is not null and "buy_back_note"."rejected_by" is not null and "buy_back_note"."rejected_at" is not null)),
	CONSTRAINT "buy_back_note_amount_check" CHECK ("buy_back_note"."amount_due" is null or "buy_back_note"."amount_due" >= 0),
	CONSTRAINT "buy_back_note_text_check" CHECK (length("buy_back_note"."reason") between 1 and 500 and ("buy_back_note"."approval_reason" is null or length("buy_back_note"."approval_reason") between 1 and 500) and ("buy_back_note"."rejected_reason" is null or length("buy_back_note"."rejected_reason") between 1 and 500))
);
--> statement-breakpoint
CREATE TABLE "buy_back_note_line" (
	"note_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" bigint NOT NULL,
	"contract_price" bigint,
	CONSTRAINT "buy_back_note_line_note_id_item_id_pk" PRIMARY KEY("note_id","item_id"),
	CONSTRAINT "buy_back_note_line_no_unique" UNIQUE("note_id","line_no"),
	CONSTRAINT "buy_back_note_line_amount_check" CHECK ("buy_back_note_line"."quantity" > 0 and "buy_back_note_line"."unit_price" >= 0 and ("buy_back_note_line"."contract_price" is null or "buy_back_note_line"."contract_price" >= 0))
);
--> statement-breakpoint
CREATE TABLE "delivery_exchange" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"delivery_note_id" uuid NOT NULL,
	"return_note_id" uuid,
	"status" text DEFAULT 'WAITING' NOT NULL,
	"cancelled_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_exchange_delivery_note_id_unique" UNIQUE("delivery_note_id"),
	CONSTRAINT "delivery_exchange_return_note_id_unique" UNIQUE("return_note_id"),
	CONSTRAINT "delivery_exchange_status_check" CHECK ("delivery_exchange"."status" in ('WAITING', 'DONE', 'CANCELLED')),
	CONSTRAINT "delivery_exchange_done_check" CHECK (("delivery_exchange"."status" = 'DONE') = ("delivery_exchange"."return_note_id" is not null)),
	CONSTRAINT "delivery_exchange_cancelled_check" CHECK (("delivery_exchange"."status" = 'CANCELLED') = ("delivery_exchange"."cancelled_reason" is not null) and ("delivery_exchange"."cancelled_reason" is null or length("delivery_exchange"."cancelled_reason") between 1 and 500))
);
--> statement-breakpoint
CREATE TABLE "delivery_exchange_line" (
	"exchange_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"expected_quantity" numeric(14, 3) NOT NULL,
	CONSTRAINT "delivery_exchange_line_exchange_id_item_id_pk" PRIMARY KEY("exchange_id","item_id"),
	CONSTRAINT "delivery_exchange_line_no_unique" UNIQUE("exchange_id","line_no"),
	CONSTRAINT "delivery_exchange_line_quantity_check" CHECK ("delivery_exchange_line"."expected_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "site_transfer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"from_contract_id" uuid NOT NULL,
	"to_contract_id" uuid NOT NULL,
	"from_site_location_id" uuid NOT NULL,
	"to_site_location_id" uuid NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"confirm_mode" text DEFAULT 'OFFICE' NOT NULL,
	"vehicle_plate" text,
	"note" text,
	"other_customer_confirmed" boolean DEFAULT false NOT NULL,
	"over_contract_confirmed" boolean DEFAULT false NOT NULL,
	"same_customer" boolean,
	"cancelled_reason" text,
	"client_draft_id" uuid,
	"posting_id" uuid,
	"business_date" date,
	"confirmed_on_device_at" timestamp with time zone,
	"posted_xact" "xid8",
	"posted_by" text,
	"posted_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_transfer_code_unique" UNIQUE("code"),
	CONSTRAINT "site_transfer_client_draft_id_unique" UNIQUE("client_draft_id"),
	CONSTRAINT "site_transfer_status_check" CHECK ("site_transfer"."status" in ('DRAFT', 'SENT', 'POSTED', 'CANCELLED')),
	CONSTRAINT "site_transfer_confirm_mode_check" CHECK ("site_transfer"."confirm_mode" in ('OFFICE', 'PHONE')),
	CONSTRAINT "site_transfer_contracts_check" CHECK ("site_transfer"."from_contract_id" <> "site_transfer"."to_contract_id"),
	CONSTRAINT "site_transfer_posted_check" CHECK (("site_transfer"."status" = 'POSTED') = ("site_transfer"."business_date" is not null and "site_transfer"."posting_id" is not null and "site_transfer"."posted_by" is not null and "site_transfer"."posted_at" is not null and "site_transfer"."posted_xact" is not null and "site_transfer"."same_customer" is not null)),
	CONSTRAINT "site_transfer_cancelled_check" CHECK (("site_transfer"."status" = 'CANCELLED') = ("site_transfer"."cancelled_reason" is not null)),
	CONSTRAINT "site_transfer_text_check" CHECK (("site_transfer"."vehicle_plate" is null or length("site_transfer"."vehicle_plate") between 1 and 20) and ("site_transfer"."note" is null or length("site_transfer"."note") between 1 and 500) and ("site_transfer"."cancelled_reason" is null or length("site_transfer"."cancelled_reason") between 1 and 500))
);
--> statement-breakpoint
CREATE TABLE "site_transfer_line" (
	"transfer_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"planned_quantity" numeric(14, 3) NOT NULL,
	"moved_quantity" numeric(14, 3),
	CONSTRAINT "site_transfer_line_transfer_id_item_id_pk" PRIMARY KEY("transfer_id","item_id"),
	CONSTRAINT "site_transfer_line_no_unique" UNIQUE("transfer_id","line_no"),
	CONSTRAINT "site_transfer_line_quantity_check" CHECK ("site_transfer_line"."planned_quantity" > 0 and ("site_transfer_line"."moved_quantity" is null or ("site_transfer_line"."moved_quantity" >= 0 and "site_transfer_line"."moved_quantity" <= "site_transfer_line"."planned_quantity")))
);
--> statement-breakpoint
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_action_check";--> statement-breakpoint
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_document_type_check";--> statement-breakpoint
ALTER TABLE "buy_back_note" ADD CONSTRAINT "buy_back_note_contract_id_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_back_note" ADD CONSTRAINT "buy_back_note_site_location_id_location_id_fk" FOREIGN KEY ("site_location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_back_note" ADD CONSTRAINT "buy_back_note_revision_id_contract_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."contract_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_back_note" ADD CONSTRAINT "buy_back_note_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_back_note" ADD CONSTRAINT "buy_back_note_rejected_by_user_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_back_note" ADD CONSTRAINT "buy_back_note_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_back_note_line" ADD CONSTRAINT "buy_back_note_line_note_id_buy_back_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."buy_back_note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_back_note_line" ADD CONSTRAINT "buy_back_note_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_exchange" ADD CONSTRAINT "delivery_exchange_contract_id_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_exchange" ADD CONSTRAINT "delivery_exchange_delivery_note_id_delivery_note_id_fk" FOREIGN KEY ("delivery_note_id") REFERENCES "public"."delivery_note"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_exchange" ADD CONSTRAINT "delivery_exchange_return_note_id_return_note_id_fk" FOREIGN KEY ("return_note_id") REFERENCES "public"."return_note"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_exchange" ADD CONSTRAINT "delivery_exchange_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_exchange_line" ADD CONSTRAINT "delivery_exchange_line_exchange_id_delivery_exchange_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."delivery_exchange"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_exchange_line" ADD CONSTRAINT "delivery_exchange_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_transfer" ADD CONSTRAINT "site_transfer_from_contract_id_contract_id_fk" FOREIGN KEY ("from_contract_id") REFERENCES "public"."contract"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_transfer" ADD CONSTRAINT "site_transfer_to_contract_id_contract_id_fk" FOREIGN KEY ("to_contract_id") REFERENCES "public"."contract"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_transfer" ADD CONSTRAINT "site_transfer_from_site_location_id_location_id_fk" FOREIGN KEY ("from_site_location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_transfer" ADD CONSTRAINT "site_transfer_to_site_location_id_location_id_fk" FOREIGN KEY ("to_site_location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_transfer" ADD CONSTRAINT "site_transfer_posted_by_user_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_transfer" ADD CONSTRAINT "site_transfer_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_transfer_line" ADD CONSTRAINT "site_transfer_line_transfer_id_site_transfer_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."site_transfer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_transfer_line" ADD CONSTRAINT "site_transfer_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buy_back_note_contract_idx" ON "buy_back_note" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "buy_back_note_status_idx" ON "buy_back_note" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "buy_back_note_line_item_idx" ON "buy_back_note_line" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "delivery_exchange_contract_idx" ON "delivery_exchange" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "site_transfer_from_idx" ON "site_transfer" USING btree ("from_contract_id");--> statement-breakpoint
CREATE INDEX "site_transfer_to_idx" ON "site_transfer" USING btree ("to_contract_id");--> statement-breakpoint
CREATE INDEX "site_transfer_status_idx" ON "site_transfer" USING btree ("status");--> statement-breakpoint
CREATE INDEX "site_transfer_line_item_idx" ON "site_transfer_line" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_action_check" CHECK ("activity_log"."action" in ('CREATE', 'UPDATE', 'SUBMIT', 'APPROVE', 'POST', 'RETURN', 'CANCEL', 'CLOSE', 'DELETE_DRAFT', 'DELETE', 'SIGN_IN', 'START', 'REJECT', 'SEND'));--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_document_type_check" CHECK ("activity_log"."document_type" in ('PURCHASE_ORDER', 'GOODS_RECEIPT', 'REPAIR_ORDER', 'STOCKTAKE', 'STOCK_ADJUSTMENT', 'OPENING_BALANCE', 'ITEM', 'ITEM_GROUP', 'KIT', 'SUPPLIER', 'CUSTOMER', 'SITE', 'LOCATION', 'USER', 'SCRAP_PRICE', 'COMPANY_PROFILE', 'CONTRACT', 'CONTRACT_AMENDMENT', 'DELIVERY_NOTE', 'RETURN_NOTE', 'COMPENSATION_NOTE', 'SITE_TRANSFER', 'BUY_BACK'));--> statement-breakpoint
-- Hand-written (site-operations design D9): a transfer changes only while it
-- is a draft or sent to the phone, and is never deleted. Its lines change
-- only while it is a draft; once posted, only the posting transaction
-- (posted_xact, not a time) may write the moved quantity of a line.
CREATE FUNCTION "site_transfer_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_status text;
  parent_xact xid8;
BEGIN
  IF TG_TABLE_NAME = 'site_transfer' THEN
    IF TG_OP = 'DELETE' OR OLD.status NOT IN ('DRAFT', 'SENT') THEN
      RAISE EXCEPTION 'Phiếu chuyển đã chuyển hoặc đã hủy, không sửa được'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  SELECT status, posted_xact INTO parent_status, parent_xact
    FROM "site_transfer" WHERE id = COALESCE(NEW.transfer_id, OLD.transfer_id);
  IF parent_status = 'DRAFT' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE' AND parent_status = 'POSTED'
     AND parent_xact = pg_current_xact_id()
     AND NEW.transfer_id = OLD.transfer_id AND NEW.item_id = OLD.item_id
     AND NEW.line_no = OLD.line_no
     AND NEW.planned_quantity = OLD.planned_quantity THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Phiếu chuyển đã gửi, đã chuyển hoặc đã hủy, không sửa dòng được'
    USING ERRCODE = 'P0001';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "site_transfer_frozen_no_change"
BEFORE UPDATE OR DELETE ON "site_transfer"
FOR EACH ROW EXECUTE FUNCTION "site_transfer_frozen"();
--> statement-breakpoint
CREATE TRIGGER "site_transfer_line_frozen_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "site_transfer_line"
FOR EACH ROW EXECUTE FUNCTION "site_transfer_frozen"();
--> statement-breakpoint
-- A buy-back note changes only while pending (lines, prices, reason, then
-- approve or reject); it is never deleted.
CREATE FUNCTION "buy_back_note_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_status text;
BEGIN
  IF TG_TABLE_NAME = 'buy_back_note' THEN
    IF TG_OP = 'DELETE' OR OLD.status <> 'PENDING' THEN
      RAISE EXCEPTION 'Phiếu mua lại đã duyệt hoặc đã từ chối, không sửa được'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  SELECT status INTO parent_status
    FROM "buy_back_note" WHERE id = COALESCE(NEW.note_id, OLD.note_id);
  IF parent_status IS DISTINCT FROM 'PENDING' THEN
    RAISE EXCEPTION 'Phiếu mua lại đã duyệt hoặc đã từ chối, không sửa được'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "buy_back_note_frozen_no_change"
BEFORE UPDATE OR DELETE ON "buy_back_note"
FOR EACH ROW EXECUTE FUNCTION "buy_back_note_frozen"();
--> statement-breakpoint
CREATE TRIGGER "buy_back_note_line_frozen_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "buy_back_note_line"
FOR EACH ROW EXECUTE FUNCTION "buy_back_note_frozen"();
--> statement-breakpoint
-- An exchange waits for its return note, then is done or cancelled for good.
-- Its expected lines are written with it and never change.
CREATE FUNCTION "delivery_exchange_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_status text;
BEGIN
  IF TG_TABLE_NAME = 'delivery_exchange' THEN
    IF TG_OP = 'DELETE' OR OLD.status <> 'WAITING' THEN
      RAISE EXCEPTION 'Lần đổi hàng đã xong hoặc đã hủy, không sửa được'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  SELECT status INTO parent_status
    FROM "delivery_exchange" WHERE id = COALESCE(NEW.exchange_id, OLD.exchange_id);
  IF TG_OP <> 'INSERT' OR parent_status IS DISTINCT FROM 'WAITING' THEN
    RAISE EXCEPTION 'Lần đổi hàng đã tạo, không sửa dòng được'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "delivery_exchange_frozen_no_change"
BEFORE UPDATE OR DELETE ON "delivery_exchange"
FOR EACH ROW EXECUTE FUNCTION "delivery_exchange_frozen"();
--> statement-breakpoint
CREATE TRIGGER "delivery_exchange_line_frozen_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "delivery_exchange_line"
FOR EACH ROW EXECUTE FUNCTION "delivery_exchange_frozen"();
