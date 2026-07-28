DROP INDEX IF EXISTS "portal_recipes_version_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "portal_recipes_version_idx" ON "portal_recipes" ("portal_key", COALESCE("payer_id", ''), "version");
