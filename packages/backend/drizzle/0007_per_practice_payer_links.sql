ALTER TABLE "clearinghouse_payers" ADD COLUMN "practice_id" varchar(26);--> statement-breakpoint
ALTER TABLE "clearinghouse_payers" ADD CONSTRAINT "clearinghouse_payers_practice_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP INDEX IF EXISTS "ch_payers_unique_idx";--> statement-breakpoint
CREATE INDEX "ch_payers_practice_idx" ON "clearinghouse_payers" USING btree ("practice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ch_payers_practice_unique_idx" ON "clearinghouse_payers" USING btree ("practice_id","clearinghouse_id","payer_id");