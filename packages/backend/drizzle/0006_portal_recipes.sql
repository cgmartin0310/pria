CREATE TABLE "portal_recipes" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"portal_key" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "portal_recipes_portal_idx" ON "portal_recipes" USING btree ("portal_key");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_recipes_version_idx" ON "portal_recipes" USING btree ("portal_key","version");