ALTER TABLE "practices" ADD COLUMN "locations" jsonb;--> statement-breakpoint
ALTER TABLE "authorizations" ADD COLUMN "service_location" jsonb;
