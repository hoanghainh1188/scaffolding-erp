CREATE SEQUENCE "public"."customer_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."site_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."supplier_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"tax_code" text,
	"contact_name" text,
	"phone" text,
	"address" text,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"note" text,
	"search_text" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "customer_code_unique" UNIQUE("code"),
	CONSTRAINT "customer_kind_check" CHECK ("customer"."kind" in ('COMPANY', 'PERSON')),
	CONSTRAINT "customer_payment_terms_check" CHECK ("customer"."payment_terms_days" between 0 and 365),
	CONSTRAINT "customer_status_check" CHECK ("customer"."status" in ('ACTIVE', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"group_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"standard_weight_kg" numeric(10, 3),
	"daily_rental_price" bigint,
	"lost_price" bigint,
	"damage_price" bigint,
	"search_text" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "item_code_unique" UNIQUE("code"),
	CONSTRAINT "item_unit_check" CHECK ("item"."unit" in ('PIECE', 'KG')),
	CONSTRAINT "item_weight_check" CHECK (("item"."unit" = 'PIECE' and "item"."standard_weight_kg" is not null and "item"."standard_weight_kg" > 0) or ("item"."unit" = 'KG' and "item"."standard_weight_kg" is null)),
	CONSTRAINT "item_rental_unit_check" CHECK ("item"."unit" = 'PIECE' or "item"."daily_rental_price" is null),
	CONSTRAINT "item_prices_check" CHECK (coalesce("item"."daily_rental_price", 0) >= 0 and coalesce("item"."lost_price", 0) >= 0 and coalesce("item"."damage_price", 0) >= 0),
	CONSTRAINT "item_code_check" CHECK ("item"."code" ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' and length("item"."code") between 2 and 20),
	CONSTRAINT "item_status_check" CHECK ("item"."status" in ('ACTIVE', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "item_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "item_group_name_key_unique" UNIQUE("name_key"),
	CONSTRAINT "item_group_status_check" CHECK ("item_group"."status" in ('ACTIVE', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "kit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"search_text" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "kit_code_unique" UNIQUE("code"),
	CONSTRAINT "kit_code_check" CHECK ("kit"."code" ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' and length("kit"."code") between 2 and 20),
	CONSTRAINT "kit_status_check" CHECK ("kit"."status" in ('ACTIVE', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "kit_component" (
	"kit_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "kit_component_kit_id_item_id_pk" PRIMARY KEY("kit_id","item_id"),
	CONSTRAINT "kit_component_quantity_check" CHECK ("kit_component"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "location" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "location_code_unique" UNIQUE("code"),
	CONSTRAINT "location_type_check" CHECK ("location"."type" in ('YARD', 'WORKSHOP', 'SITE')),
	CONSTRAINT "location_status_check" CHECK ("location"."status" in ('ACTIVE', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "site" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"customer_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"search_text" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "site_code_unique" UNIQUE("code"),
	CONSTRAINT "site_location_id_unique" UNIQUE("location_id"),
	CONSTRAINT "site_status_check" CHECK ("site"."status" in ('ACTIVE', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"address" text,
	"tax_code" text,
	"id_number" text,
	"bank_account" text,
	"bank_name" text,
	"note" text,
	"search_text" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "supplier_code_unique" UNIQUE("code"),
	CONSTRAINT "supplier_kind_check" CHECK ("supplier"."kind" in ('COMPANY', 'PERSON')),
	CONSTRAINT "supplier_id_number_check" CHECK ("supplier"."id_number" is null or "supplier"."id_number" ~ '^[0-9]{12}$'),
	CONSTRAINT "supplier_status_check" CHECK ("supplier"."status" in ('ACTIVE', 'ARCHIVED'))
);
--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_group_id_item_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."item_group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_group" ADD CONSTRAINT "item_group_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_group" ADD CONSTRAINT "item_group_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit" ADD CONSTRAINT "kit_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit" ADD CONSTRAINT "kit_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_component" ADD CONSTRAINT "kit_component_kit_id_kit_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."kit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_component" ADD CONSTRAINT "kit_component_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site" ADD CONSTRAINT "site_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site" ADD CONSTRAINT "site_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site" ADD CONSTRAINT "site_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site" ADD CONSTRAINT "site_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_group_idx" ON "item" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "kit_component_item_idx" ON "kit_component" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "site_customer_idx" ON "site" USING btree ("customer_id");--> statement-breakpoint
-- The company runs 1 yard + 1 workshop (requirements 0.1); added by hand.
INSERT INTO "location" ("code", "name", "type") VALUES
	('BAI-01', 'Bãi chính', 'YARD'),
	('XUONG-01', 'Xưởng', 'WORKSHOP');
