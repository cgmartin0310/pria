ALTER TABLE "patients" ADD COLUMN "referring_provider_first_name" varchar(100);--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "referring_provider_last_name" varchar(100);--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "referring_provider_npi" varchar(10);