-- AlterTable
ALTER TABLE "proxy" ADD COLUMN     "last_synced_log_id" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "log_webhook_url" TEXT;
