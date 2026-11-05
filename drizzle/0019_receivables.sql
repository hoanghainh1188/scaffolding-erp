CREATE TABLE "contract_settlement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"settled_date" date NOT NULL,
	"refund_amount" bigint NOT NULL,
	"refund_date" date,
	"refund_method" text,
	"settled_by" text NOT NULL,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_settlement_contract_id_unique" UNIQUE("contract_id"),
	CONSTRAINT "contract_settlement_refund_check" CHECK (("contract_settlement"."refund_amount" = 0 and "contract_settlement"."refund_date" is null and "contract_settlement"."refund_method" is null) or ("contract_settlement"."refund_amount" > 0 and "contract_settlement"."refund_date" is not null and "contract_settlement"."refund_method" in ('CASH', 'TRANSFER')))
);
--> statement-breakpoint
CREATE TABLE "receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"contract_id" uuid,
	"amount" bigint NOT NULL,
	"method" text NOT NULL,
	"received_date" date NOT NULL,
	"note" text,
	"request_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_code_unique" UNIQUE("code"),
	CONSTRAINT "receipt_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "receipt_kind_check" CHECK (("receipt"."kind" = 'PAYMENT' and "receipt"."contract_id" is null) or ("receipt"."kind" = 'DEPOSIT' and "receipt"."contract_id" is not null)),
	CONSTRAINT "receipt_shape_check" CHECK ("receipt"."amount" > 0 and "receipt"."method" in ('CASH', 'TRANSFER') and ("receipt"."note" is null or length("receipt"."note") between 1 and 500))
);
--> statement-breakpoint
CREATE TABLE "receipt_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid,
	"credit_period_id" uuid,
	"billing_period_id" uuid,
	"delivery_note_id" uuid,
	"compensation_note_id" uuid,
	"buy_back_note_id" uuid,
	"amount" bigint NOT NULL,
	"mode" text NOT NULL,
	"settlement_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_allocation_source_check" CHECK (num_nonnulls("receipt_allocation"."receipt_id", "receipt_allocation"."credit_period_id") = 1),
	CONSTRAINT "receipt_allocation_debt_check" CHECK (num_nonnulls("receipt_allocation"."billing_period_id", "receipt_allocation"."delivery_note_id", "receipt_allocation"."compensation_note_id", "receipt_allocation"."buy_back_note_id") = 1),
	CONSTRAINT "receipt_allocation_shape_check" CHECK ("receipt_allocation"."amount" > 0 and "receipt_allocation"."mode" in ('AUTO', 'MANUAL', 'PREPAYMENT', 'DEPOSIT') and ("receipt_allocation"."mode" = 'DEPOSIT') = ("receipt_allocation"."settlement_id" is not null) and ("receipt_allocation"."credit_period_id" is null or "receipt_allocation"."mode" = 'PREPAYMENT'))
);
--> statement-breakpoint
CREATE TABLE "receipt_cancellation" (
	"receipt_id" uuid PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"cancelled_by" text NOT NULL,
	"cancelled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_cancellation_reason_check" CHECK (length("receipt_cancellation"."reason") between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_action_check";--> statement-breakpoint
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_document_type_check";--> statement-breakpoint
ALTER TABLE "contract_settlement" ADD CONSTRAINT "contract_settlement_contract_id_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_settlement" ADD CONSTRAINT "contract_settlement_settled_by_user_id_fk" FOREIGN KEY ("settled_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_contract_id_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_allocation" ADD CONSTRAINT "receipt_allocation_receipt_id_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipt"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_allocation" ADD CONSTRAINT "receipt_allocation_credit_period_id_billing_period_id_fk" FOREIGN KEY ("credit_period_id") REFERENCES "public"."billing_period"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_allocation" ADD CONSTRAINT "receipt_allocation_billing_period_id_billing_period_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_period"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_allocation" ADD CONSTRAINT "receipt_allocation_delivery_note_id_delivery_note_id_fk" FOREIGN KEY ("delivery_note_id") REFERENCES "public"."delivery_note"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_allocation" ADD CONSTRAINT "receipt_allocation_compensation_note_id_compensation_note_id_fk" FOREIGN KEY ("compensation_note_id") REFERENCES "public"."compensation_note"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_allocation" ADD CONSTRAINT "receipt_allocation_buy_back_note_id_buy_back_note_id_fk" FOREIGN KEY ("buy_back_note_id") REFERENCES "public"."buy_back_note"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_allocation" ADD CONSTRAINT "receipt_allocation_settlement_id_contract_settlement_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."contract_settlement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_allocation" ADD CONSTRAINT "receipt_allocation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_cancellation" ADD CONSTRAINT "receipt_cancellation_receipt_id_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipt"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_cancellation" ADD CONSTRAINT "receipt_cancellation_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipt_customer_idx" ON "receipt" USING btree ("customer_id","received_date");--> statement-breakpoint
CREATE INDEX "receipt_contract_idx" ON "receipt" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "receipt_allocation_receipt_idx" ON "receipt_allocation" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "receipt_allocation_credit_idx" ON "receipt_allocation" USING btree ("credit_period_id");--> statement-breakpoint
CREATE INDEX "receipt_allocation_period_idx" ON "receipt_allocation" USING btree ("billing_period_id");--> statement-breakpoint
CREATE INDEX "receipt_allocation_delivery_idx" ON "receipt_allocation" USING btree ("delivery_note_id");--> statement-breakpoint
CREATE INDEX "receipt_allocation_compensation_idx" ON "receipt_allocation" USING btree ("compensation_note_id");--> statement-breakpoint
CREATE INDEX "receipt_allocation_buy_back_idx" ON "receipt_allocation" USING btree ("buy_back_note_id");--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_action_check" CHECK ("activity_log"."action" in ('CREATE', 'UPDATE', 'SUBMIT', 'APPROVE', 'POST', 'RETURN', 'CANCEL', 'CLOSE', 'DELETE_DRAFT', 'DELETE', 'SIGN_IN', 'START', 'REJECT', 'SEND', 'CLOSE_PERIOD', 'SETTLE'));--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_document_type_check" CHECK ("activity_log"."document_type" in ('PURCHASE_ORDER', 'GOODS_RECEIPT', 'REPAIR_ORDER', 'STOCKTAKE', 'STOCK_ADJUSTMENT', 'OPENING_BALANCE', 'ITEM', 'ITEM_GROUP', 'KIT', 'SUPPLIER', 'CUSTOMER', 'SITE', 'LOCATION', 'USER', 'SCRAP_PRICE', 'COMPANY_PROFILE', 'CONTRACT', 'CONTRACT_AMENDMENT', 'DELIVERY_NOTE', 'RETURN_NOTE', 'COMPENSATION_NOTE', 'SITE_TRANSFER', 'BUY_BACK', 'BILLING_PERIOD', 'BILLING_ADJUSTMENT', 'RENTAL_HOLIDAY', 'RECEIPT'));--> statement-breakpoint
-- Hand-written (receivables design D2): receipts, their allocations and
-- cancellations, and contract settlements are money events. They are never
-- changed or deleted (APPEND_ONLY_TABLES); a mistake is a cancellation row.
-- TRUNCATE passes on test databases like the ledger does.
CREATE FUNCTION "receivable_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    IF "inventory_truncate_allowed"(
      current_database(),
      current_setting('inventory.allow_truncate', true)
    ) THEN
      RETURN NULL;
    END IF;
  END IF;
  RAISE EXCEPTION 'Phiếu thu chỉ ghi thêm. Ghi sai thì hủy phiếu và lập phiếu mới'
    USING ERRCODE = 'P0001';
END;
$$;
--> statement-breakpoint
-- No allocation from a cancelled receipt.
CREATE FUNCTION "receipt_allocation_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.receipt_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM "receipt_cancellation" WHERE receipt_id = NEW.receipt_id
  ) THEN
    RAISE EXCEPTION 'Phiếu thu đã hủy, không trừ thêm được'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "receipt_allocation_live_receipt"
BEFORE INSERT ON "receipt_allocation"
FOR EACH ROW EXECUTE FUNCTION "receipt_allocation_guard"();
--> statement-breakpoint
CREATE TRIGGER "receipt_no_update_delete"
BEFORE UPDATE OR DELETE ON "receipt"
FOR EACH ROW EXECUTE FUNCTION "receivable_append_only"();
--> statement-breakpoint
CREATE TRIGGER "receipt_no_truncate"
BEFORE TRUNCATE ON "receipt"
FOR EACH STATEMENT EXECUTE FUNCTION "receivable_append_only"();
--> statement-breakpoint
CREATE TRIGGER "receipt_allocation_no_update_delete"
BEFORE UPDATE OR DELETE ON "receipt_allocation"
FOR EACH ROW EXECUTE FUNCTION "receivable_append_only"();
--> statement-breakpoint
CREATE TRIGGER "receipt_allocation_no_truncate"
BEFORE TRUNCATE ON "receipt_allocation"
FOR EACH STATEMENT EXECUTE FUNCTION "receivable_append_only"();
--> statement-breakpoint
CREATE TRIGGER "receipt_cancellation_no_update_delete"
BEFORE UPDATE OR DELETE ON "receipt_cancellation"
FOR EACH ROW EXECUTE FUNCTION "receivable_append_only"();
--> statement-breakpoint
CREATE TRIGGER "receipt_cancellation_no_truncate"
BEFORE TRUNCATE ON "receipt_cancellation"
FOR EACH STATEMENT EXECUTE FUNCTION "receivable_append_only"();
--> statement-breakpoint
CREATE TRIGGER "contract_settlement_no_update_delete"
BEFORE UPDATE OR DELETE ON "contract_settlement"
FOR EACH ROW EXECUTE FUNCTION "receivable_append_only"();
--> statement-breakpoint
CREATE TRIGGER "contract_settlement_no_truncate"
BEFORE TRUNCATE ON "contract_settlement"
FOR EACH STATEMENT EXECUTE FUNCTION "receivable_append_only"();
