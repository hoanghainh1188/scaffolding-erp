CREATE TABLE "stocktake" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"location_id" uuid NOT NULL,
	"scope_all" boolean NOT NULL,
	"status" text DEFAULT 'COUNTING' NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"client_start_id" uuid NOT NULL,
	"last_submission_id" uuid,
	"started_by" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp with time zone,
	"returned_reason" text,
	"returned_by" text,
	"returned_at" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"posting_id" uuid,
	"cancel_reason" text,
	"cancelled_by" text,
	"cancelled_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stocktake_code_unique" UNIQUE("code"),
	CONSTRAINT "stocktake_client_start_id_unique" UNIQUE("client_start_id"),
	CONSTRAINT "stocktake_status_check" CHECK ("stocktake"."status" in ('COUNTING', 'SUBMITTED', 'DONE', 'CANCELLED')),
	CONSTRAINT "stocktake_round_check" CHECK ("stocktake"."round" >= 1),
	CONSTRAINT "stocktake_done_check" CHECK (("stocktake"."status" = 'DONE') = ("stocktake"."approved_at" is not null and "stocktake"."approved_by" is not null)),
	CONSTRAINT "stocktake_cancelled_check" CHECK (("stocktake"."status" = 'CANCELLED') = ("stocktake"."cancelled_at" is not null and "stocktake"."cancelled_by" is not null and "stocktake"."cancel_reason" is not null)),
	CONSTRAINT "stocktake_posting_check" CHECK ("stocktake"."posting_id" is null or "stocktake"."status" = 'DONE'),
	CONSTRAINT "stocktake_reason_check" CHECK (("stocktake"."returned_reason" is null or length("stocktake"."returned_reason") between 1 and 500) and ("stocktake"."cancel_reason" is null or length("stocktake"."cancel_reason") between 1 and 500))
);
--> statement-breakpoint
CREATE TABLE "stocktake_group" (
	"stocktake_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "stocktake_group_stocktake_id_group_id_pk" PRIMARY KEY("stocktake_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "stocktake_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stocktake_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"condition" text NOT NULL,
	"origin" text NOT NULL,
	"count_started_at" timestamp with time zone,
	"counted_at" timestamp with time zone,
	"counted_quantity" numeric(14, 3),
	"book_quantity" numeric(14, 3),
	"flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"recount" boolean DEFAULT false NOT NULL,
	"unit_cost" bigint,
	CONSTRAINT "stocktake_line_pair_unique" UNIQUE("stocktake_id","item_id","condition"),
	CONSTRAINT "stocktake_line_condition_check" CHECK ("stocktake_line"."condition" in ('NEW', 'GOOD', 'NEEDS_REPAIR', 'SCRAP')),
	CONSTRAINT "stocktake_line_origin_check" CHECK ("stocktake_line"."origin" in ('LISTED', 'ADDED')),
	CONSTRAINT "stocktake_line_count_check" CHECK (("stocktake_line"."counted_at" is null and "stocktake_line"."counted_quantity" is null and "stocktake_line"."book_quantity" is null) or ("stocktake_line"."counted_at" is not null and "stocktake_line"."counted_quantity" is not null and "stocktake_line"."book_quantity" is not null and "stocktake_line"."counted_quantity" >= 0)),
	CONSTRAINT "stocktake_line_flags_check" CHECK ("stocktake_line"."flags" <@ array['MOVED', 'OVER_PCT', 'CONDITION_SWAP']::text[]),
	CONSTRAINT "stocktake_line_unit_cost_check" CHECK ("stocktake_line"."unit_cost" is null or "stocktake_line"."unit_cost" >= 0)
);
--> statement-breakpoint
ALTER TABLE "stocktake" ADD CONSTRAINT "stocktake_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake" ADD CONSTRAINT "stocktake_started_by_user_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake" ADD CONSTRAINT "stocktake_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake" ADD CONSTRAINT "stocktake_returned_by_user_id_fk" FOREIGN KEY ("returned_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake" ADD CONSTRAINT "stocktake_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake" ADD CONSTRAINT "stocktake_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_group" ADD CONSTRAINT "stocktake_group_stocktake_id_stocktake_id_fk" FOREIGN KEY ("stocktake_id") REFERENCES "public"."stocktake"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_group" ADD CONSTRAINT "stocktake_group_group_id_item_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."item_group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_line" ADD CONSTRAINT "stocktake_line_stocktake_id_stocktake_id_fk" FOREIGN KEY ("stocktake_id") REFERENCES "public"."stocktake"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_line" ADD CONSTRAINT "stocktake_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stocktake_open_location_unique" ON "stocktake" USING btree ("location_id") WHERE "stocktake"."status" in ('COUNTING', 'SUBMITTED');--> statement-breakpoint
CREATE INDEX "stocktake_status_idx" ON "stocktake" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "stocktake_line_item_idx" ON "stocktake_line" USING btree ("item_id");--> statement-breakpoint
-- Hand-written (stocktake design D12): a session the director approved and
-- its lines are frozen, even for SQL typed by hand. The approval turns the
-- session DONE last, in the transaction that posts its ledger lines.
CREATE FUNCTION "stocktake_done_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_status text;
BEGIN
  IF TG_TABLE_NAME = 'stocktake' THEN
    parent_status := OLD.status;
  ELSE
    SELECT status INTO parent_status FROM "stocktake"
      WHERE id = COALESCE(OLD.stocktake_id, NEW.stocktake_id);
  END IF;
  IF parent_status = 'DONE' THEN
    RAISE EXCEPTION 'Phiên kiểm kê đã ghi sổ, không sửa được'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "stocktake_done_no_change"
BEFORE UPDATE OR DELETE ON "stocktake"
FOR EACH ROW EXECUTE FUNCTION "stocktake_done_frozen"();
--> statement-breakpoint
CREATE TRIGGER "stocktake_line_done_no_change"
BEFORE INSERT OR UPDATE OR DELETE ON "stocktake_line"
FOR EACH ROW EXECUTE FUNCTION "stocktake_done_frozen"();
