-- Remove unused machine_code column from log table
-- Reason: machine_code field was never populated and is not used in the application
-- Impact: This is a breaking change - the column and its data will be permanently deleted

-- AlterTable
ALTER TABLE "public"."log" DROP COLUMN IF EXISTS "machine_code";
