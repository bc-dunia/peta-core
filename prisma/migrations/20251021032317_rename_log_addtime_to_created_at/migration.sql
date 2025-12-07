/*
  Rename Log.addtime to Log.createdAt and change type from BIGINT to INTEGER
  Preserves all existing data by converting BIGINT to INTEGER
*/

-- Drop old index
DROP INDEX IF EXISTS "public"."log_addtime_idx";

-- Rename column and convert type (BIGINT → INTEGER)
-- The USING clause safely converts BigInt to Integer
ALTER TABLE "public"."log"
  RENAME COLUMN "addtime" TO "created_at";

ALTER TABLE "public"."log"
  ALTER COLUMN "created_at" TYPE INTEGER USING "created_at"::INTEGER;

-- Create new index on renamed column
CREATE INDEX "log_created_at_idx" ON "public"."log"("created_at");
