CREATE TABLE "purchase_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"outcome" text,
	"expected_date" date,
	"expected_time" time,
	"vehicle" text,
	"note" text,
	"allocation_method" text DEFAULT 'VALUE' NOT NULL,
	"end_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"placed_by" text,
	"placed_at" timestamp with time zone,
	"ended_by" text,
	"ended_at" timestamp with time zone,
	CONSTRAINT "purchase_order_code_unique" UNIQUE("code"),
	CONSTRAINT "purchase_order_kind_check" CHECK ("purchase_order"."kind" in ('NEW', 'USED')),
	CONSTRAINT "purchase_order_status_check" CHECK ("purchase_order"."status" in ('DRAFT', 'IN_PROGRESS', 'DONE')),
	CONSTRAINT "purchase_order_outcome_check" CHECK (("purchase_order"."status" = 'DONE') = ("purchase_order"."outcome" is not null) and ("purchase_order"."outcome" is null or "purchase_order"."outcome" in ('RECEIVED', 'CLOSED', 'CANCELLED'))),
	CONSTRAINT "purchase_order_expected_check" CHECK ("purchase_order"."status" = 'DRAFT' or "purchase_order"."expected_date" is not null),
	CONSTRAINT "purchase_order_cancel_check" CHECK ("purchase_order"."outcome" is distinct from 'CANCELLED' or "purchase_order"."end_reason" is not null),
	CONSTRAINT "purchase_order_allocation_check" CHECK ("purchase_order"."allocation_method" in ('VALUE', 'WEIGHT'))
);
--> statement-breakpoint
CREATE TABLE "purchase_order_cost" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"label" text NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "purchase_order_cost_values_check" CHECK ("purchase_order_cost"."amount" > 0 and length("purchase_order_cost"."label") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchase_order_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_event_kind_check" CHECK ("purchase_order_event"."kind" in ('CREATED', 'PLACED', 'UPDATED', 'CANCELLED', 'CLOSED'))
);
--> statement-breakpoint
CREATE TABLE "purchase_order_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" bigint NOT NULL,
	CONSTRAINT "purchase_order_line_item_unique" UNIQUE("order_id","item_id"),
	CONSTRAINT "purchase_order_line_unit_check" CHECK ("purchase_order_line"."unit" in ('PIECE', 'KG')),
	CONSTRAINT "purchase_order_line_values_check" CHECK ("purchase_order_line"."quantity" > 0 and "purchase_order_line"."unit_price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_placed_by_user_id_fk" FOREIGN KEY ("placed_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_ended_by_user_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_cost" ADD CONSTRAINT "purchase_order_cost_order_id_purchase_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_event" ADD CONSTRAINT "purchase_order_event_order_id_purchase_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_event" ADD CONSTRAINT "purchase_order_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_order_id_purchase_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_order_status_idx" ON "purchase_order" USING btree ("status","expected_date");--> statement-breakpoint
CREATE INDEX "purchase_order_supplier_idx" ON "purchase_order" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchase_order_cost_order_idx" ON "purchase_order_cost" USING btree ("order_id","line_no");--> statement-breakpoint
CREATE INDEX "purchase_order_event_order_idx" ON "purchase_order_event" USING btree ("order_id","id");--> statement-breakpoint
CREATE INDEX "purchase_order_line_item_idx" ON "purchase_order_line" USING btree ("item_id");