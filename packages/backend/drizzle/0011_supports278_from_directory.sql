-- Backfill: 278-API capability follows the directory's word. Links whose
-- synced capabilities say api278 != "yes" were wrongly assumed API-capable
-- (Claim.MD-era default) and routed into a dead API rung.
UPDATE "clearinghouse_payers"
SET "supports_278" = false
WHERE "capabilities" IS NOT NULL
  AND COALESCE("capabilities"->>'api278', 'no') != 'yes';