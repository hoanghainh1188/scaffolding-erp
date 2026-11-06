CREATE TABLE "supplier_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" bigint NOT NULL,
	"method" text NOT NULL,
	"paid_date" date NOT NULL,
	"note" text,
	"request_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_payment_code_unique" UNIQUE("code"),
	CONSTRAINT "supplier_payment_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "supplier_payment_shape_check" CHECK ("supplier_payment"."amount" > 0 and "supplier_payment"."kind" in ('PAYMENT', 'ADVANCE') and "supplier_payment"."method" in ('CASH', 'TRANSFER') and ("supplier_payment"."note" is null or length("supplier_payment"."note") between 1 and 500))
);
--> statement-breakpoint
CREATE TABLE "supplier_payment_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"goods_receipt_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"mode" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_payment_allocation_shape_check" CHECK ("supplier_payment_allocation"."amount" > 0 and "supplier_payment_allocation"."mode" in ('AUTO', 'MANUAL', 'ADVANCE'))
);
--> statement-breakpoint
CREATE TABLE "supplier_payment_cancellation" (
	"payment_id" uuid PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"cancelled_by" text NOT NULL,
	"cancelled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_payment_cancellation_reason_check" CHECK (length("supplier_payment_cancellation"."reason") between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_document_type_check";--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "payment_terms_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Hand-edited (payables design D11): receipts posted before this change are
-- due on their receipt day (0.2 #99, #105). Filled before the append-only
-- trigger below exists.
ALTER TABLE "goods_receipt" ADD COLUMN "due_date" date;--> statement-breakpoint
UPDATE "goods_receipt" SET "due_date" = "business_date";--> statement-breakpoint
ALTER TABLE "goods_receipt" ALTER COLUMN "due_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_payment" ADD CONSTRAINT "supplier_payment_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment" ADD CONSTRAINT "supplier_payment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_allocation" ADD CONSTRAINT "supplier_payment_allocation_payment_id_supplier_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."supplier_payment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_allocation" ADD CONSTRAINT "supplier_payment_allocation_goods_receipt_id_goods_receipt_id_fk" FOREIGN KEY ("goods_receipt_id") REFERENCES "public"."goods_receipt"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_allocation" ADD CONSTRAINT "supplier_payment_allocation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_cancellation" ADD CONSTRAINT "supplier_payment_cancellation_payment_id_supplier_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."supplier_payment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_cancellation" ADD CONSTRAINT "supplier_payment_cancellation_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_payment_supplier_idx" ON "supplier_payment" USING btree ("supplier_id","paid_date");--> statement-breakpoint
CREATE INDEX "supplier_payment_allocation_payment_idx" ON "supplier_payment_allocation" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "supplier_payment_allocation_receipt_idx" ON "supplier_payment_allocation" USING btree ("goods_receipt_id");--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_payment_terms_check" CHECK ("supplier"."payment_terms_days" between 0 and 365);--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_document_type_check" CHECK ("activity_log"."document_type" in ('PURCHASE_ORDER', 'GOODS_RECEIPT', 'REPAIR_ORDER', 'STOCKTAKE', 'STOCK_ADJUSTMENT', 'OPENING_BALANCE', 'ITEM', 'ITEM_GROUP', 'KIT', 'SUPPLIER', 'CUSTOMER', 'SITE', 'LOCATION', 'USER', 'SCRAP_PRICE', 'COMPANY_PROFILE', 'CONTRACT', 'CONTRACT_AMENDMENT', 'DELIVERY_NOTE', 'RETURN_NOTE', 'COMPENSATION_NOTE', 'SITE_TRANSFER', 'BUY_BACK', 'BILLING_PERIOD', 'BILLING_ADJUSTMENT', 'RENTAL_HOLIDAY', 'RECEIPT', 'SUPPLIER_PAYMENT'));--> statement-breakpoint
-- Hand-written (payables design D3, D5, D11): supplier payments, their
-- allocations and cancellations are money events, and posted goods receipts
-- are what the seller is owed. None is ever changed or deleted
-- (APPEND_ONLY_TABLES); a payment mistake is a cancellation row. TRUNCATE
-- passes on test databases like the ledger does (inventory.allow_truncate).
CREATE FUNCTION "supplier_payment_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' AND "inventory_truncate_allowed"(
    current_database(),
    current_setting('inventory.allow_truncate', true)
  ) THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'Phiếu chi chỉ ghi thêm. Ghi sai thì hủy phiếu và lập phiếu mới'
    USING ERRCODE = 'P0001';
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "goods_receipt_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' AND "inventory_truncate_allowed"(
    current_database(),
    current_setting('inventory.allow_truncate', true)
  ) THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'Phiếu nhập đã ghi sổ không sửa, không xóa được'
    USING ERRCODE = 'P0001';
END;
$$;
--> statement-breakpoint
-- An allocation takes money from a live payment of the same seller.
CREATE FUNCTION "supplier_payment_allocation_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "supplier_payment_cancellation"
    WHERE payment_id = NEW.payment_id
  ) THEN
    RAISE EXCEPTION 'Phiếu chi đã hủy, không trừ thêm được'
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM "supplier_payment" p
    JOIN "goods_receipt" r ON r.id = NEW.goods_receipt_id
    JOIN "purchase_order" o ON o.id = r.order_id
    WHERE p.id = NEW.payment_id AND p.supplier_id = o.supplier_id
  ) THEN
    RAISE EXCEPTION 'Phiếu chi và phiếu nhập không cùng người bán'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "supplier_payment_allocation_same_supplier"
BEFORE INSERT ON "supplier_payment_allocation"
FOR EACH ROW EXECUTE FUNCTION "supplier_payment_allocation_guard"();
--> statement-breakpoint
-- What the seller is owed comes from the price, unit and item of the order
-- line (payables design D5): once goods came in on it, they stay.
CREATE FUNCTION "purchase_order_line_received_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.unit_price, NEW.unit, NEW.item_id)
       IS DISTINCT FROM (OLD.unit_price, OLD.unit, OLD.item_id)
     AND EXISTS (
       SELECT 1 FROM "goods_receipt_line" WHERE order_line_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'Dòng đơn đã có phiếu nhập: không đổi đơn giá, đơn vị, vật tư.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "purchase_order_line_received_locked"
BEFORE UPDATE ON "purchase_order_line"
FOR EACH ROW EXECUTE FUNCTION "purchase_order_line_received_guard"();
--> statement-breakpoint
CREATE TRIGGER "supplier_payment_no_update_delete"
BEFORE UPDATE OR DELETE ON "supplier_payment"
FOR EACH ROW EXECUTE FUNCTION "supplier_payment_append_only"();
--> statement-breakpoint
CREATE TRIGGER "supplier_payment_no_truncate"
BEFORE TRUNCATE ON "supplier_payment"
FOR EACH STATEMENT EXECUTE FUNCTION "supplier_payment_append_only"();
--> statement-breakpoint
CREATE TRIGGER "supplier_payment_allocation_no_update_delete"
BEFORE UPDATE OR DELETE ON "supplier_payment_allocation"
FOR EACH ROW EXECUTE FUNCTION "supplier_payment_append_only"();
--> statement-breakpoint
CREATE TRIGGER "supplier_payment_allocation_no_truncate"
BEFORE TRUNCATE ON "supplier_payment_allocation"
FOR EACH STATEMENT EXECUTE FUNCTION "supplier_payment_append_only"();
--> statement-breakpoint
CREATE TRIGGER "supplier_payment_cancellation_no_update_delete"
BEFORE UPDATE OR DELETE ON "supplier_payment_cancellation"
FOR EACH ROW EXECUTE FUNCTION "supplier_payment_append_only"();
--> statement-breakpoint
CREATE TRIGGER "supplier_payment_cancellation_no_truncate"
BEFORE TRUNCATE ON "supplier_payment_cancellation"
FOR EACH STATEMENT EXECUTE FUNCTION "supplier_payment_append_only"();
--> statement-breakpoint
CREATE TRIGGER "goods_receipt_no_update_delete"
BEFORE UPDATE OR DELETE ON "goods_receipt"
FOR EACH ROW EXECUTE FUNCTION "goods_receipt_append_only"();
--> statement-breakpoint
CREATE TRIGGER "goods_receipt_no_truncate"
BEFORE TRUNCATE ON "goods_receipt"
FOR EACH STATEMENT EXECUTE FUNCTION "goods_receipt_append_only"();
--> statement-breakpoint
CREATE TRIGGER "goods_receipt_line_no_update_delete"
BEFORE UPDATE OR DELETE ON "goods_receipt_line"
FOR EACH ROW EXECUTE FUNCTION "goods_receipt_append_only"();
--> statement-breakpoint
CREATE TRIGGER "goods_receipt_line_no_truncate"
BEFORE TRUNCATE ON "goods_receipt_line"
FOR EACH STATEMENT EXECUTE FUNCTION "goods_receipt_append_only"();
--> statement-breakpoint
CREATE TRIGGER "goods_receipt_cost_no_update_delete"
BEFORE UPDATE OR DELETE ON "goods_receipt_cost"
FOR EACH ROW EXECUTE FUNCTION "goods_receipt_append_only"();
--> statement-breakpoint
CREATE TRIGGER "goods_receipt_cost_no_truncate"
BEFORE TRUNCATE ON "goods_receipt_cost"
FOR EACH STATEMENT EXECUTE FUNCTION "goods_receipt_append_only"();
