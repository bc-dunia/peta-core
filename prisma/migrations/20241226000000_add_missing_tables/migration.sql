-- CreateTable ip_whitelist
CREATE TABLE IF NOT EXISTS "public"."ip_whitelist" (
    "id" SERIAL NOT NULL,
    "ip" VARCHAR(128) NOT NULL DEFAULT '',
    "addtime" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ip_whitelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable license
CREATE TABLE IF NOT EXISTS "public"."license" (
    "id" SERIAL NOT NULL,
    "license_str" TEXT NOT NULL,
    "addtime" INTEGER NOT NULL,
    "status" INTEGER NOT NULL,

    CONSTRAINT "license_pkey" PRIMARY KEY ("id")
);

-- AlterTable dns_conf
ALTER TABLE "public"."dns_conf" ADD COLUMN IF NOT EXISTS "tunnel_id" VARCHAR(256) NOT NULL DEFAULT '';

-- AlterTable log 
ALTER TABLE "public"."log" DROP COLUMN IF EXISTS "timestamp";
ALTER TABLE "public"."log" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "public"."log" DROP COLUMN IF EXISTS "type";
ALTER TABLE "public"."log" DROP COLUMN IF EXISTS "request_content";
ALTER TABLE "public"."log" DROP COLUMN IF EXISTS "response_content";
ALTER TABLE "public"."log" DROP COLUMN IF EXISTS "error_content";
ALTER TABLE "public"."log" DROP COLUMN IF EXISTS "serverID";

ALTER TABLE "public"."log" ADD COLUMN IF NOT EXISTS "addtime" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."log" ADD COLUMN IF NOT EXISTS "action" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."log" ADD COLUMN IF NOT EXISTS "userid" VARCHAR NOT NULL DEFAULT '';
ALTER TABLE "public"."log" ADD COLUMN IF NOT EXISTS "session_id" VARCHAR NOT NULL DEFAULT '';
ALTER TABLE "public"."log" ADD COLUMN IF NOT EXISTS "upstream_request_id" VARCHAR NOT NULL DEFAULT '';
ALTER TABLE "public"."log" ADD COLUMN IF NOT EXISTS "uniform_request_id" VARCHAR NOT NULL DEFAULT '';
ALTER TABLE "public"."log" ADD COLUMN IF NOT EXISTS "ip" VARCHAR NOT NULL DEFAULT '';
ALTER TABLE "public"."log" ADD COLUMN IF NOT EXISTS "machine_code" VARCHAR NOT NULL DEFAULT '';
ALTER TABLE "public"."log" ADD COLUMN IF NOT EXISTS "ua" VARCHAR NOT NULL DEFAULT '';
ALTER TABLE "public"."log" ADD COLUMN IF NOT EXISTS "event_type" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."log" ADD COLUMN IF NOT EXISTS "token_mask" VARCHAR NOT NULL DEFAULT '';
ALTER TABLE "public"."log" ADD COLUMN IF NOT EXISTS "request_params" TEXT NOT NULL DEFAULT '';
ALTER TABLE "public"."log" ADD COLUMN IF NOT EXISTS "response_result" TEXT NOT NULL DEFAULT '';
ALTER TABLE "public"."log" ADD COLUMN IF NOT EXISTS "error" TEXT NOT NULL DEFAULT '';