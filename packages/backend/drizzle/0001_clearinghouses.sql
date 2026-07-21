CREATE TABLE "clearinghouses" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"key" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_clearinghouses" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"practice_id" varchar(26) NOT NULL,
	"clearinghouse_id" varchar(26) NOT NULL,
	"label" varchar(255),
	"credentials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clearinghouse_payers" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"clearinghouse_id" varchar(26) NOT NULL,
	"payer_id" varchar(26) NOT NULL,
	"clearinghouse_payer_id" varchar(50) NOT NULL,
	"supports_278" boolean DEFAULT true NOT NULL,
	"capabilities" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practice_clearinghouses" ADD CONSTRAINT "practice_clearinghouses_practice_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_clearinghouses" ADD CONSTRAINT "practice_clearinghouses_clearinghouse_id_fk" FOREIGN KEY ("clearinghouse_id") REFERENCES "public"."clearinghouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearinghouse_payers" ADD CONSTRAINT "clearinghouse_payers_clearinghouse_id_fk" FOREIGN KEY ("clearinghouse_id") REFERENCES "public"."clearinghouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearinghouse_payers" ADD CONSTRAINT "clearinghouse_payers_payer_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."payers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clearinghouses_key_idx" ON "clearinghouses" USING btree ("key");--> statement-breakpoint
CREATE INDEX "practice_ch_practice_idx" ON "practice_clearinghouses" USING btree ("practice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_ch_unique_idx" ON "practice_clearinghouses" USING btree ("practice_id","clearinghouse_id");--> statement-breakpoint
CREATE INDEX "ch_payers_ch_idx" ON "clearinghouse_payers" USING btree ("clearinghouse_id");--> statement-breakpoint
CREATE INDEX "ch_payers_payer_idx" ON "clearinghouse_payers" USING btree ("payer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ch_payers_unique_idx" ON "clearinghouse_payers" USING btree ("clearinghouse_id","payer_id");