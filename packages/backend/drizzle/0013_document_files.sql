ALTER TYPE "document_type" ADD VALUE IF NOT EXISTS 'attachment';--> statement-breakpoint
ALTER TABLE "authorization_documents" ADD COLUMN "file_name" varchar(255);--> statement-breakpoint
ALTER TABLE "authorization_documents" ADD COLUMN "mime_type" varchar(100);--> statement-breakpoint
ALTER TABLE "authorization_documents" ADD COLUMN "file_data" text;
