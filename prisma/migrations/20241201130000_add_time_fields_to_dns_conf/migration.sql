-- AlterTable
-- Add addtime and update_time fields to dns_conf table

ALTER TABLE "dns_conf" ADD COLUMN "addtime" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "dns_conf" ADD COLUMN "update_time" INTEGER NOT NULL DEFAULT 0;

-- Field descriptions:
-- addtime: Creation timestamp (Unix timestamp)
-- update_time: Last update timestamp (Unix timestamp)