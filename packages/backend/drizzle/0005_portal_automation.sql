CREATE TYPE "public"."portal_submission_status" AS ENUM('queued', 'logging_in', 'needs_mfa', 'in_progress', 'needs_human', 'submitted', 'failed');--> statement-breakpoint
CREATE TABLE "portal_connections" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"practice_id" varchar(26) NOT NULL,
	"portal_key" varchar(50) NOT NULL,
	"label" varchar(255),
	"encrypted_credentials" text,
	"encrypted_session" text,
	"session_valid_until" timestamp,
	"last_login_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_submissions" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"practice_id" varchar(26) NOT NULL,
	"authorization_id" varchar(26) NOT NULL,
	"portal_connection_id" varchar(26) NOT NULL,
	"status" "portal_submission_status" DEFAULT 'queued' NOT NULL,
	"payload" jsonb,
	"confirmation_number" varchar(100),
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"needs_human_reason" text,
	"claimed_by" varchar(100),
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_connections" ADD CONSTRAINT "portal_connections_practice_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_submissions" ADD CONSTRAINT "portal_submissions_practice_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_submissions" ADD CONSTRAINT "portal_submissions_authorization_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."authorizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_submissions" ADD CONSTRAINT "portal_submissions_portal_connection_id_fk" FOREIGN KEY ("portal_connection_id") REFERENCES "public"."portal_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_conn_practice_idx" ON "portal_connections" USING btree ("practice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_conn_unique_idx" ON "portal_connections" USING btree ("practice_id","portal_key");--> statement-breakpoint
CREATE INDEX "portal_sub_practice_idx" ON "portal_submissions" USING btree ("practice_id");--> statement-breakpoint
CREATE INDEX "portal_sub_auth_idx" ON "portal_submissions" USING btree ("authorization_id");--> statement-breakpoint
CREATE INDEX "portal_sub_status_idx" ON "portal_submissions" USING btree ("status");