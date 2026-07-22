CREATE TABLE "clearinghouse_payer_directory" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"clearinghouse_id" varchar(26) NOT NULL,
	"payer_id" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"transactions" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clearinghouse_payer_directory" ADD CONSTRAINT "ch_payer_directory_clearinghouse_id_fk" FOREIGN KEY ("clearinghouse_id") REFERENCES "public"."clearinghouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ch_dir_ch_idx" ON "clearinghouse_payer_directory" USING btree ("clearinghouse_id");--> statement-breakpoint
CREATE INDEX "ch_dir_name_idx" ON "clearinghouse_payer_directory" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "ch_dir_unique_idx" ON "clearinghouse_payer_directory" USING btree ("clearinghouse_id","payer_id");