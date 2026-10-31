TRUNCATE TABLE "login_throttle";
--> statement-breakpoint
ALTER TABLE "login_throttle" DROP CONSTRAINT IF EXISTS "login_throttle_pkey";
--> statement-breakpoint
ALTER TABLE "login_throttle" ADD COLUMN "ip" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "login_throttle" ADD CONSTRAINT "login_throttle_username_key_ip_pk" PRIMARY KEY("username_key","ip");
--> statement-breakpoint
CREATE INDEX "login_throttle_username_key_idx" ON "login_throttle" USING btree ("username_key");
