-- AlterTable: Add config_template column to server table
ALTER TABLE "server" ADD COLUMN "config_template" TEXT DEFAULT '';

-- AlterTable: Rename server_api_keys to launch_configs in user table
ALTER TABLE "user" RENAME COLUMN "server_api_keys" TO "launch_configs";

-- DataMigration: Ensure launch_configs has default value of empty object
UPDATE "user" SET "launch_configs" = '{}' WHERE "launch_configs" = '' OR "launch_configs" IS NULL;

-- AlterTable: Set default value for launch_configs
ALTER TABLE "user" ALTER COLUMN "launch_configs" SET DEFAULT '{}';
