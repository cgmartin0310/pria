CREATE TYPE "public"."document_type" AS ENUM('clinical_note', 'letter_of_necessity', 'appeal');--> statement-breakpoint
CREATE TYPE "public"."pa_status" AS ENUM('draft', 'submitted', 'pending', 'approved', 'denied', 'expired', 'appeal');--> statement-breakpoint
CREATE TYPE "public"."plan_tier" AS ENUM('solo', 'practice', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'therapist', 'billing');--> statement-breakpoint
CREATE TABLE "authorization_documents" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"authorization_id" varchar(26) NOT NULL,
	"type" "document_type" NOT NULL,
	"content" text NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authorization_history" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"authorization_id" varchar(26) NOT NULL,
	"action" varchar(100) NOT NULL,
	"from_status" "pa_status",
	"to_status" "pa_status" NOT NULL,
	"notes" text,
	"performed_by" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authorizations" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"practice_id" varchar(26) NOT NULL,
	"patient_id" varchar(26) NOT NULL,
	"payer_id" varchar(26) NOT NULL,
	"provider_id" varchar(26),
	"status" "pa_status" DEFAULT 'draft' NOT NULL,
	"auth_number" varchar(100),
	"certification_type_code" varchar(2),
	"service_type_code" varchar(5),
	"level_of_service_code" varchar(2),
	"place_of_service_code" varchar(5),
	"request_category_code" varchar(5),
	"cpt_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"icd_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visit_pattern" jsonb,
	"requested_visits" integer DEFAULT 12 NOT NULL,
	"approved_visits" integer,
	"service_lines" jsonb,
	"start_date" varchar(10),
	"end_date" varchar(10),
	"onset_date" varchar(10),
	"previous_auth_number" varchar(100),
	"internal_tracking_number" varchar(100),
	"visits_used" integer DEFAULT 0 NOT NULL,
	"clinical_summary" text,
	"clinical_notes" text,
	"accident_indicator" varchar(3),
	"decision_code" varchar(5),
	"decision_message" text,
	"certification_period_start" varchar(10),
	"certification_period_end" varchar(10),
	"submitted_at" timestamp,
	"decided_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"practice_id" varchar(26) NOT NULL,
	"payer_id" varchar(26),
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"middle_name" varchar(100),
	"dob" varchar(10) NOT NULL,
	"gender" varchar(1),
	"address" jsonb,
	"phone" varchar(20),
	"member_id" varchar(100) NOT NULL,
	"relationship_to_subscriber" varchar(5) DEFAULT '18' NOT NULL,
	"group_number" varchar(50),
	"subscriber_last_name" varchar(100),
	"subscriber_first_name" varchar(100),
	"subscriber_middle_name" varchar(100),
	"subscriber_member_id" varchar(100),
	"subscriber_dob" varchar(10),
	"subscriber_gender" varchar(1),
	"subscriber_address" jsonb,
	"diagnosis_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payer_rules" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"payer_id" varchar(26) NOT NULL,
	"cpt_code" varchar(10) NOT NULL,
	"requires_auth" boolean DEFAULT true NOT NULL,
	"visit_threshold" integer,
	"criteria" jsonb DEFAULT '{"diagnosisRequired":true,"functionalLimitationsRequired":true,"progressNotesRequired":false,"physicianOrderRequired":false,"additionalDocs":[],"notes":""}'::jsonb NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payers" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"payer_id" varchar(50) NOT NULL,
	"payer_id_qualifier" varchar(5) DEFAULT 'PI' NOT NULL,
	"portal_url" text,
	"rules_config" jsonb DEFAULT '{"requiresPreAuth":true,"submissionMethod":"x12","avgDecisionDays":5,"notes":""}'::jsonb NOT NULL,
	"supports_x278" boolean DEFAULT false NOT NULL,
	"supports_fhir" boolean DEFAULT false NOT NULL,
	"clearinghouse_routing" jsonb
);
--> statement-breakpoint
CREATE TABLE "practices" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"npi" varchar(10) NOT NULL,
	"address" jsonb NOT NULL,
	"phone" varchar(20) NOT NULL,
	"fax" varchar(20),
	"email" varchar(255),
	"plan" "plan_tier" DEFAULT 'solo' NOT NULL,
	"clinic_config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"practice_id" varchar(26) NOT NULL,
	"user_id" varchar(26),
	"npi" varchar(10) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"suffix" varchar(50),
	"credentials" varchar(100),
	"taxonomy_code" varchar(20) NOT NULL,
	"state_license_number" varchar(50),
	"discipline" varchar(5) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"practice_id" varchar(26) NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'therapist' NOT NULL,
	"clerk_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authorization_documents" ADD CONSTRAINT "authorization_documents_authorization_id_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."authorizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_history" ADD CONSTRAINT "authorization_history_authorization_id_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."authorizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_payer_id_payers_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."payers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_payer_id_payers_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."payers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payer_rules" ADD CONSTRAINT "payer_rules_payer_id_payers_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."payers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_docs_auth_id_idx" ON "authorization_documents" USING btree ("authorization_id");--> statement-breakpoint
CREATE INDEX "auth_history_auth_id_idx" ON "authorization_history" USING btree ("authorization_id");--> statement-breakpoint
CREATE INDEX "auths_practice_id_idx" ON "authorizations" USING btree ("practice_id");--> statement-breakpoint
CREATE INDEX "auths_patient_id_idx" ON "authorizations" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "auths_payer_id_idx" ON "authorizations" USING btree ("payer_id");--> statement-breakpoint
CREATE INDEX "auths_provider_id_idx" ON "authorizations" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "auths_status_idx" ON "authorizations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "auths_expires_at_idx" ON "authorizations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "patients_practice_id_idx" ON "patients" USING btree ("practice_id");--> statement-breakpoint
CREATE INDEX "patients_payer_id_idx" ON "patients" USING btree ("payer_id");--> statement-breakpoint
CREATE INDEX "patients_name_idx" ON "patients" USING btree ("last_name","first_name");--> statement-breakpoint
CREATE INDEX "payer_rules_payer_id_idx" ON "payer_rules" USING btree ("payer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payer_rules_payer_cpt_idx" ON "payer_rules" USING btree ("payer_id","cpt_code");--> statement-breakpoint
CREATE UNIQUE INDEX "payers_payer_id_idx" ON "payers" USING btree ("payer_id");--> statement-breakpoint
CREATE INDEX "providers_practice_id_idx" ON "providers" USING btree ("practice_id");--> statement-breakpoint
CREATE INDEX "providers_user_id_idx" ON "providers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "providers_npi_idx" ON "providers" USING btree ("npi");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_practice_id_idx" ON "users" USING btree ("practice_id");--> statement-breakpoint
CREATE INDEX "users_clerk_id_idx" ON "users" USING btree ("clerk_id");