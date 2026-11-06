CREATE INDEX "inventory_ledger_movement_date_idx" ON "inventory_ledger" USING btree ("movement","business_date");--> statement-breakpoint
CREATE INDEX "delivery_note_posted_date_idx" ON "delivery_note" USING btree ("business_date") WHERE "delivery_note"."status" = 'POSTED';--> statement-breakpoint
CREATE INDEX "billing_period_month_idx" ON "billing_period" USING btree ("month");